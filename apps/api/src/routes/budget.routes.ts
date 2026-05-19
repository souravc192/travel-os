import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import db, { withTransaction } from '../config/db';
import { cacheGet, cacheSet, cacheDel, RedisKey, TTL } from '../config/redis';

const router = Router();

// GET /api/v1/budget/summary — Employee's own cost centre
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.sub;

    // Get employee's cost centre
    const empResult = await db.query(
      'SELECT cost_centre_id FROM employees WHERE user_id = $1', [userId]
    );
    const costCentreId = req.query.costCentreId as string || empResult.rows[0]?.cost_centre_id;

    if (!costCentreId) {
      res.json({ success: true, data: null });
      return;
    }

    // Check cache
    const cacheKey = RedisKey.budgetSummary(costCentreId);
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, meta: { fromCache: true } });
      return;
    }

    const result = await db.query(
      `SELECT bm.*, cc.code AS cost_centre_code, cc.name AS cost_centre_name,
              d.name AS department_name,
              (bm.allocated + bm.supplementary_approved - bm.consumed) AS remaining,
              ROUND((bm.consumed / NULLIF(bm.allocated + bm.supplementary_approved, 0)) * 100, 2) AS utilization_pct
       FROM budget_master bm
       JOIN cost_centres cc ON cc.id = bm.cost_centre_id
       JOIN departments d ON d.id = cc.department_id
       WHERE bm.cost_centre_id = $1
       ORDER BY bm.fiscal_year DESC
       LIMIT 1`,
      [costCentreId]
    );

    const data = result.rows[0] || null;
    if (data) await cacheSet(cacheKey, data, TTL.BUDGET_SUMMARY);

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/v1/budget/org-overview — Admins, Finance, Travel Desk
router.get('/org-overview', authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.FINANCE_ADMIN, UserRole.TRAVEL_DESK),
  async (_req, res, next) => {
    try {
      const result = await db.query(`SELECT * FROM org_spend_summary ORDER BY utilization_pct DESC`);
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  }
);

// GET /api/v1/budget/:id/history
router.get('/:id/history', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT bh.*, u.email AS actor_email, e.name AS actor_name
       FROM budget_history bh
       LEFT JOIN users u ON u.id = bh.actor_id
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE bh.budget_id = $1
       ORDER BY bh.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// POST /api/v1/budget/supplementary — Request additional budget
router.post('/supplementary', authenticate, async (req, res, next) => {
  try {
    const { amount, reason, costCentreId } = req.body;
    const userId = req.user!.sub;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive.' } });
      return;
    }
    if (!reason || reason.trim().length < 20) {
      res.status(400).json({ success: false, error: { code: 'REASON_TOO_SHORT', message: 'Reason must be at least 20 characters.' } });
      return;
    }

    const empResult = await db.query('SELECT id, cost_centre_id FROM employees WHERE user_id = $1', [userId]);
    const employee  = empResult.rows[0];
    const ccId      = costCentreId || employee?.cost_centre_id;

    const budgetResult = await db.query(
      `SELECT id FROM budget_master WHERE cost_centre_id = $1 AND fiscal_year = $2`,
      [ccId, '2024-25']
    );

    if (!budgetResult.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'BUDGET_NOT_FOUND', message: 'Budget record not found.' } });
      return;
    }

    const request = await db.query(
      `INSERT INTO supplementary_requests (budget_id, requested_by, amount, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [budgetResult.rows[0].id, employee.id, amount, reason.trim()]
    );

    res.status(201).json({ success: true, data: request.rows[0], message: 'Supplementary budget request submitted.' });
  } catch (err) { next(err); }
});

// POST /api/v1/budget/supplementary/:id/approve — Finance or Super Admin
router.post('/supplementary/:id/approve',
  authenticate,
  authorize(UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const { note, action } = req.body; // action: 'APPROVE' | 'REJECT'
      const userId = req.user!.sub;
      const role   = req.user!.role;

      if (!['APPROVE', 'REJECT'].includes(action)) {
        res.status(400).json({ success: false, error: { code: 'INVALID_ACTION', message: 'Action must be APPROVE or REJECT.' } });
        return;
      }

      const requestResult = await db.query(
        'SELECT * FROM supplementary_requests WHERE id = $1', [req.params.id]
      );
      const sr = requestResult.rows[0];
      if (!sr) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found.' } });
        return;
      }

      await withTransaction(async (client) => {
        if (role === UserRole.FINANCE_ADMIN) {
          await client.query(
            `UPDATE supplementary_requests SET
               status = $1, finance_note = $2, finance_actor = $3, finance_at = NOW()
             WHERE id = $4`,
            [action === 'APPROVE' ? 'FINANCE_APPROVED' : 'REJECTED', note, userId, sr.id]
          );
        } else if (role === UserRole.SUPER_ADMIN) {
          if (action === 'APPROVE') {
            // Actually grant the supplementary budget
            await client.query(
              `UPDATE budget_master SET supplementary_approved = supplementary_approved + $1
               WHERE id = $2`,
              [sr.amount, sr.budget_id]
            );
            await client.query(
              `INSERT INTO budget_history (budget_id, action, amount, balance_after, actor_id)
               SELECT $1, 'SUPPLEMENT', $2,
                      (allocated + supplementary_approved - consumed), $3
               FROM budget_master WHERE id = $1`,
              [sr.budget_id, sr.amount, userId]
            );
            await cacheDel(RedisKey.budgetSummary(sr.budget_id));
          }
          await client.query(
            `UPDATE supplementary_requests SET
               status = $1, super_note = $2, super_actor = $3, super_at = NOW()
             WHERE id = $4`,
            [action === 'APPROVE' ? 'SUPER_APPROVED' : 'REJECTED', note, userId, sr.id]
          );
        }
      });

      res.json({ success: true, message: `Request ${action.toLowerCase()}d.` });
    } catch (err) { next(err); }
  }
);

export default router;
