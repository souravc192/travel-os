import { Request, Response, NextFunction } from 'express';
import db, { withTransaction, queryWithUser } from '../config/db';
import { cacheGet, cacheSet, cacheDel, RedisKey, TTL } from '../config/redis';
import { logger } from '../config/logger';
import { UserRole } from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function currentFiscalYear(d: Date = new Date()): string {
  // India FY: Apr–Mar. 2024-04-01 → '2024-25'; 2025-02-01 → '2024-25'
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed
  const start = m >= 3 ? y : y - 1;
  const end   = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, '0')}`;
}

function asNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function shapeBudget(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  const allocated  = asNumber(row.allocated);
  const consumed   = asNumber(row.consumed);
  const supp       = asNumber(row.supplementary_approved);
  const totalPool  = allocated + supp;
  const remaining  = totalPool - consumed;
  const utilPct    = totalPool > 0 ? Math.round((consumed / totalPool) * 10000) / 100 : 0;
  return {
    id:                    row.id,
    costCentreId:          row.cost_centre_id,
    costCentreCode:        row.cost_centre_code,
    costCentreName:        row.cost_centre_name,
    departmentName:        row.department_name,
    fiscalYear:            row.fiscal_year,
    allocated,
    consumed,
    supplementaryApproved: supp,
    remaining,
    utilizationPct:        utilPct,
    lastUpdatedBy:         row.last_updated_by,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
  };
}

// ─── GET /budget/summary ──────────────────────────────────────
export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const empResult = await db.query(
      'SELECT cost_centre_id FROM employees WHERE user_id = $1', [userId]
    );
    const costCentreId =
      (req.query.costCentreId as string) || empResult.rows[0]?.cost_centre_id;
    const fiscalYear =
      (req.query.fiscalYear as string) || currentFiscalYear();

    if (!costCentreId) {
      res.json({ success: true, data: null });
      return;
    }

    const cacheKey = `${RedisKey.budgetSummary(costCentreId)}:${fiscalYear}`;
    const cached = await cacheGet(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, meta: { fromCache: true } });
      return;
    }

    const result = await db.query(
      `SELECT bm.*, cc.code AS cost_centre_code, cc.name AS cost_centre_name,
              d.name AS department_name
       FROM budget_master bm
       JOIN cost_centres cc ON cc.id = bm.cost_centre_id
       JOIN departments  d  ON d.id  = cc.department_id
       WHERE bm.cost_centre_id = $1 AND bm.fiscal_year = $2
       LIMIT 1`,
      [costCentreId, fiscalYear]
    );

    const data = shapeBudget(result.rows[0]);
    if (data) await cacheSet(cacheKey, data, TTL.BUDGET_SUMMARY);

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── GET /budget/org-overview ─────────────────────────────────
export async function getOrgOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fiscalYear = (req.query.fiscalYear as string) || currentFiscalYear();

    const result = await db.query(
      `SELECT bm.id,
              bm.cost_centre_id,
              cc.code AS cost_centre_code,
              cc.name AS cost_centre_name,
              d.id    AS department_id,
              d.name  AS department_name,
              bm.fiscal_year,
              bm.allocated,
              bm.consumed,
              bm.supplementary_approved,
              (bm.allocated + bm.supplementary_approved - bm.consumed) AS remaining,
              CASE
                WHEN (bm.allocated + bm.supplementary_approved) = 0 THEN 0
                ELSE ROUND((bm.consumed / NULLIF(bm.allocated + bm.supplementary_approved, 0)) * 100, 2)
              END AS utilization_pct
       FROM budget_master bm
       JOIN cost_centres cc ON cc.id = bm.cost_centre_id
       JOIN departments  d  ON d.id  = cc.department_id
       WHERE bm.fiscal_year = $1
       ORDER BY utilization_pct DESC NULLS LAST`,
      [fiscalYear]
    );

    const rows = result.rows.map(shapeBudget);

    // Aggregate totals
    const totals = rows.reduce(
      (acc, r) => {
        if (!r) return acc;
        acc.allocated             += r.allocated;
        acc.consumed              += r.consumed;
        acc.supplementaryApproved += r.supplementaryApproved;
        acc.remaining             += r.remaining;
        return acc;
      },
      { allocated: 0, consumed: 0, supplementaryApproved: 0, remaining: 0 }
    );
    const pool = totals.allocated + totals.supplementaryApproved;
    const overallUtilization = pool > 0
      ? Math.round((totals.consumed / pool) * 10000) / 100
      : 0;

    res.json({
      success: true,
      data: rows,
      meta: { fiscalYear, totals: { ...totals, overallUtilization }, count: rows.length },
    });
  } catch (err) { next(err); }
}

// ─── GET /budget/:id ──────────────────────────────────────────
export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT bm.*, cc.code AS cost_centre_code, cc.name AS cost_centre_name,
              d.name AS department_name
       FROM budget_master bm
       JOIN cost_centres cc ON cc.id = bm.cost_centre_id
       JOIN departments  d  ON d.id  = cc.department_id
       WHERE bm.id = $1`,
      [req.params.id]
    );
    const data = shapeBudget(result.rows[0]);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── GET /budget/:id/history ──────────────────────────────────
export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit  = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const result = await db.query(
      `SELECT bh.id, bh.action, bh.amount, bh.balance_after, bh.note, bh.trip_id,
              bh.created_at,
              u.email AS actor_email, e.name AS actor_name,
              t.trip_code
       FROM budget_history bh
       LEFT JOIN users u     ON u.id = bh.actor_id
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN trips t     ON t.id = bh.trip_id
       WHERE bh.budget_id = $1
       ORDER BY bh.created_at DESC
       LIMIT $2`,
      [req.params.id, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

// ─── POST /budget — Create allocation (admin/finance only) ────
export async function createAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { costCentreId, fiscalYear, allocated } = req.body;
    const userId = req.user!.sub;

    if (!costCentreId || !fiscalYear || allocated === undefined) {
      res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'costCentreId, fiscalYear, allocated required.' } });
      return;
    }
    if (allocated < 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Allocated must be ≥ 0.' } });
      return;
    }

    const out = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO budget_master (cost_centre_id, fiscal_year, allocated, last_updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cost_centre_id, fiscal_year) DO UPDATE
           SET allocated       = EXCLUDED.allocated,
               last_updated_by = EXCLUDED.last_updated_by
         RETURNING *`,
        [costCentreId, fiscalYear, allocated, userId]
      );
      const budget = inserted.rows[0];
      await client.query(
        `INSERT INTO budget_history (budget_id, action, amount, balance_after, actor_id, note)
         VALUES ($1, 'ALLOCATE', $2, $3, $4, $5)`,
        [
          budget.id,
          allocated,
          asNumber(budget.allocated) + asNumber(budget.supplementary_approved) - asNumber(budget.consumed),
          userId,
          'Initial / updated allocation',
        ]
      );
      return budget;
    });

    await cacheDel(`${RedisKey.budgetSummary(costCentreId)}:${fiscalYear}`);
    res.status(201).json({ success: true, data: shapeBudget(out) });
  } catch (err) { next(err); }
}

// ─── POST /budget/:id/adjust — Manual adjustment ──────────────
export async function adjustBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { delta, note } = req.body; // delta may be negative
    const userId = req.user!.sub;
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_DELTA', message: 'delta must be a non-zero number.' } });
      return;
    }
    if (!note || String(note).trim().length < 10) {
      res.status(400).json({ success: false, error: { code: 'NOTE_REQUIRED', message: 'note ≥ 10 chars required for audit.' } });
      return;
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE budget_master
           SET allocated = allocated + $1,
               last_updated_by = $2
         WHERE id = $3
         RETURNING *`,
        [delta, userId, req.params.id]
      );
      const b = result.rows[0];
      if (!b) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

      await client.query(
        `INSERT INTO budget_history (budget_id, action, amount, balance_after, actor_id, note)
         VALUES ($1, 'ADJUST', $2, $3, $4, $5)`,
        [
          b.id,
          delta,
          asNumber(b.allocated) + asNumber(b.supplementary_approved) - asNumber(b.consumed),
          userId,
          String(note).trim(),
        ]
      );
      return b;
    });

    await cacheDel(`${RedisKey.budgetSummary(updated.cost_centre_id)}:${updated.fiscal_year}`);
    res.json({ success: true, data: shapeBudget(updated) });
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    next(err);
  }
}

// ─── GET /budget/supplementary ────────────────────────────────
export async function listSupplementary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role   = req.user!.role;
    const userId = req.user!.sub;
    const status = (req.query.status as string) || null;
    const params: unknown[] = [];
    const where: string[] = [];

    if (status) {
      params.push(status);
      where.push(`sr.status = $${params.length}`);
    }

    // Employees only see their own; Finance/Super see all
    if (role !== UserRole.FINANCE_ADMIN && role !== UserRole.SUPER_ADMIN) {
      params.push(userId);
      where.push(`emp.user_id = $${params.length}`);
    }

    const sql = `
      SELECT sr.*,
             bm.cost_centre_id, bm.fiscal_year,
             cc.code AS cost_centre_code, cc.name AS cost_centre_name,
             emp.name AS requested_by_name, emp.user_id AS requested_by_user_id
      FROM supplementary_requests sr
      JOIN budget_master bm ON bm.id = sr.budget_id
      JOIN cost_centres  cc ON cc.id = bm.cost_centre_id
      JOIN employees    emp ON emp.id = sr.requested_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sr.created_at DESC
      LIMIT 100
    `;
    const result = await db.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

// ─── POST /budget/supplementary ───────────────────────────────
export async function requestSupplementary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { amount, reason, costCentreId, fiscalYear } = req.body;
    const userId = req.user!.sub;

    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive.' } });
      return;
    }
    if (!reason || String(reason).trim().length < 20) {
      res.status(400).json({ success: false, error: { code: 'REASON_TOO_SHORT', message: 'Reason must be at least 20 characters.' } });
      return;
    }

    const empResult = await db.query(
      'SELECT id, cost_centre_id FROM employees WHERE user_id = $1', [userId]
    );
    const employee = empResult.rows[0];
    if (!employee) {
      res.status(403).json({ success: false, error: { code: 'NO_EMPLOYEE', message: 'Employee record not found.' } });
      return;
    }
    const ccId = costCentreId || employee.cost_centre_id;
    const fy   = fiscalYear   || currentFiscalYear();

    const budgetResult = await db.query(
      `SELECT id FROM budget_master WHERE cost_centre_id = $1 AND fiscal_year = $2`,
      [ccId, fy]
    );
    if (!budgetResult.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'BUDGET_NOT_FOUND', message: 'Budget record not found for that cost centre / fiscal year.' } });
      return;
    }

    const created = await db.query(
      `INSERT INTO supplementary_requests (budget_id, requested_by, amount, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [budgetResult.rows[0].id, employee.id, amount, String(reason).trim()]
    );

    res.status(201).json({
      success: true,
      data: created.rows[0],
      message: 'Supplementary budget request submitted.',
    });
  } catch (err) { next(err); }
}

// ─── POST /budget/supplementary/:id/approve ───────────────────
export async function approveSupplementary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { note, action } = req.body; // 'APPROVE' | 'REJECT'
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
    if (sr.status === 'REJECTED' || sr.status === 'SUPER_APPROVED') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_DECIDED', message: `Request already ${sr.status}.` } });
      return;
    }

    // Two-step workflow:
    //  PENDING  → FINANCE_ADMIN approves → FINANCE_APPROVED
    //  FINANCE_APPROVED → SUPER_ADMIN approves → SUPER_APPROVED (grants budget)
    if (role === UserRole.FINANCE_ADMIN && sr.status !== 'PENDING') {
      res.status(409).json({ success: false, error: { code: 'WRONG_STAGE', message: 'Request is not at finance stage.' } });
      return;
    }
    if (role === UserRole.SUPER_ADMIN && action === 'APPROVE' && sr.status !== 'FINANCE_APPROVED') {
      res.status(409).json({ success: false, error: { code: 'WRONG_STAGE', message: 'Finance must approve first.' } });
      return;
    }

    await withTransaction(async (client) => {
      if (role === UserRole.FINANCE_ADMIN) {
        await client.query(
          `UPDATE supplementary_requests
             SET status = $1, finance_note = $2, finance_actor = $3, finance_at = NOW()
           WHERE id = $4`,
          [action === 'APPROVE' ? 'FINANCE_APPROVED' : 'REJECTED', note, userId, sr.id]
        );
      } else if (role === UserRole.SUPER_ADMIN) {
        if (action === 'APPROVE') {
          await client.query(
            `UPDATE budget_master
               SET supplementary_approved = supplementary_approved + $1,
                   last_updated_by = $2
             WHERE id = $3`,
            [sr.amount, userId, sr.budget_id]
          );
          await client.query(
            `INSERT INTO budget_history (budget_id, action, amount, balance_after, actor_id, note)
             SELECT $1, 'SUPPLEMENT', $2,
                    (allocated + supplementary_approved - consumed), $3, $4
               FROM budget_master WHERE id = $1`,
            [sr.budget_id, sr.amount, userId, `Supplementary approved: ${sr.id}`]
          );
          const bm = await client.query(
            'SELECT cost_centre_id, fiscal_year FROM budget_master WHERE id = $1', [sr.budget_id]
          );
          if (bm.rows[0]) {
            await cacheDel(`${RedisKey.budgetSummary(bm.rows[0].cost_centre_id)}:${bm.rows[0].fiscal_year}`);
          }
        }
        await client.query(
          `UPDATE supplementary_requests
             SET status = $1, super_note = $2, super_actor = $3, super_at = NOW()
           WHERE id = $4`,
          [action === 'APPROVE' ? 'SUPER_APPROVED' : 'REJECTED', note, userId, sr.id]
        );
      }
    });

    logger.info(`Supplementary ${sr.id} ${action} by ${role} (${userId})`);
    res.json({ success: true, message: `Request ${action.toLowerCase()}d.` });
  } catch (err) { next(err); }
}

// ─── Internal: consume budget (called from trips engine in Phase 3+) ──
// Exposed as an admin-only manual hook here. Trip approval flow will call
// the same SQL pattern transactionally.
export async function consumeBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { amount, tripId, note } = req.body;
    const userId = req.user!.sub;
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'amount must be > 0.' } });
      return;
    }

    const updated = await withTransaction(async (client) => {
      const sel = await client.query(
        `SELECT * FROM budget_master WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      const b = sel.rows[0];
      if (!b) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });

      const pool      = asNumber(b.allocated) + asNumber(b.supplementary_approved);
      const newSpend  = asNumber(b.consumed) + amount;
      if (newSpend > pool) {
        throw Object.assign(new Error('BUDGET_EXCEEDED'), { status: 409 });
      }

      const upd = await client.query(
        `UPDATE budget_master
           SET consumed = consumed + $1, last_updated_by = $2
         WHERE id = $3 RETURNING *`,
        [amount, userId, b.id]
      );
      const bNew = upd.rows[0];
      await client.query(
        `INSERT INTO budget_history (budget_id, action, amount, balance_after, actor_id, trip_id, note)
         VALUES ($1, 'CONSUME', $2, $3, $4, $5, $6)`,
        [
          b.id, amount,
          asNumber(bNew.allocated) + asNumber(bNew.supplementary_approved) - asNumber(bNew.consumed),
          userId, tripId || null, note || null,
        ]
      );
      return bNew;
    });

    await cacheDel(`${RedisKey.budgetSummary(updated.cost_centre_id)}:${updated.fiscal_year}`);

    // Side-effect: evaluate alert thresholds (best-effort, non-blocking)
    evaluateAlerts(updated.id).catch((e) => logger.warn(`Alert eval failed: ${e}`));

    res.json({ success: true, data: shapeBudget(updated) });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    if (status === 409) {
      res.status(409).json({ success: false, error: { code: 'BUDGET_EXCEEDED', message: 'Consume would exceed pool.' } });
      return;
    }
    next(err);
  }
}

// ─── Alerts ───────────────────────────────────────────────────
export async function listAlertThresholds(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT * FROM budget_alert_thresholds ORDER BY threshold_pct ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function upsertAlertThreshold(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thresholdPct, channel, isActive, label } = req.body;
    const userId = req.user!.sub;
    if (typeof thresholdPct !== 'number' || thresholdPct <= 0 || thresholdPct > 200) {
      res.status(400).json({ success: false, error: { code: 'INVALID_THRESHOLD', message: 'thresholdPct must be 1–200.' } });
      return;
    }
    const result = await queryWithUser<Record<string, unknown>>(
      `INSERT INTO budget_alert_thresholds (threshold_pct, channel, is_active, label, updated_by)
       VALUES ($1, $2, COALESCE($3, true), $4, $5)
       ON CONFLICT (threshold_pct) DO UPDATE
         SET channel    = EXCLUDED.channel,
             is_active  = EXCLUDED.is_active,
             label      = EXCLUDED.label,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING *`,
      [thresholdPct, channel || 'IN_APP', isActive, label || null, userId],
      userId
    );
    res.status(201).json({ success: true, data: result[0] });
  } catch (err) { next(err); }
}

export async function deleteAlertThreshold(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await db.query(`DELETE FROM budget_alert_thresholds WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Threshold removed.' });
  } catch (err) { next(err); }
}

export async function listAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const budgetId = req.query.budgetId as string | undefined;
    const params: unknown[] = [];
    let where = '';
    if (budgetId) { params.push(budgetId); where = `WHERE ba.budget_id = $1`; }
    const result = await db.query(
      `SELECT ba.*, bm.cost_centre_id, bm.fiscal_year, cc.code AS cost_centre_code
         FROM budget_alerts ba
         JOIN budget_master bm ON bm.id = ba.budget_id
         JOIN cost_centres  cc ON cc.id = bm.cost_centre_id
         ${where}
         ORDER BY ba.fired_at DESC
         LIMIT 100`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

// Internal helper — evaluates and fires alerts for a single budget row
async function evaluateAlerts(budgetId: string): Promise<void> {
  const b = await db.query(
    `SELECT id, cost_centre_id, fiscal_year, allocated, consumed, supplementary_approved
       FROM budget_master WHERE id = $1`,
    [budgetId]
  );
  const row = b.rows[0];
  if (!row) return;
  const pool = asNumber(row.allocated) + asNumber(row.supplementary_approved);
  if (pool <= 0) return;
  const pct = (asNumber(row.consumed) / pool) * 100;

  const thresholds = await db.query(
    `SELECT * FROM budget_alert_thresholds WHERE is_active = true AND threshold_pct <= $1`,
    [pct]
  );

  for (const t of thresholds.rows) {
    // Has this threshold already fired for this budget?
    const existing = await db.query(
      `SELECT id FROM budget_alerts
         WHERE budget_id = $1 AND threshold_id = $2`,
      [row.id, t.id]
    );
    if (existing.rows[0]) continue;

    await db.query(
      `INSERT INTO budget_alerts (budget_id, threshold_id, threshold_pct, actual_pct, channel)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, t.id, t.threshold_pct, Math.round(pct * 100) / 100, t.channel]
    );
    logger.info(`Budget alert fired: budget=${row.id} threshold=${t.threshold_pct}% actual=${pct.toFixed(2)}%`);
  }
}
