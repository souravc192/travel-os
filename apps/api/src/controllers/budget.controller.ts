import { Request, Response, NextFunction } from 'express';
import db, { withTransaction } from '../config/db';
import { cacheGet, cacheSet, cacheDel, TTL } from '../config/redis';
import { logger } from '../config/logger';
import { UserRole } from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function currentFiscalYear(d: Date = new Date()): string {
  // India FY: Apr–Mar. 2026-04-01 → '2026-27'
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const cacheKey = (deptId: string, fy: string) => `budget:dept:${deptId}:${fy}`;

function asNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function shape(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  const allocated = asNumber(row.allocated_annual);
  const supp      = asNumber(row.supplementary_approved);
  const consumed  = asNumber(row.consumed);
  const pool      = allocated + supp;
  const remaining = pool - consumed;
  return {
    id:                     row.id,
    departmentId:           row.department_id,
    departmentName:         row.department_name,
    fiscalYear:             row.fiscal_year,
    allocatedAnnual:        allocated,
    supplementaryApproved:  supp,
    consumed,
    remaining,
    utilizationPct: pool > 0 ? Math.round((consumed / pool) * 10000) / 100 : 0,
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  };
}

// ─── GET /budget/summary — caller's department ────────────────
export async function getMyBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const departmentId =
      (req.query.departmentId as string) ||
      (await db.query(
        `SELECT department_id FROM employees WHERE user_id = $1`, [userId]
      )).rows[0]?.department_id;
    const fy = (req.query.fiscalYear as string) || currentFiscalYear();

    if (!departmentId) {
      res.json({ success: true, data: null });
      return;
    }

    const cached = await cacheGet(cacheKey(departmentId, fy));
    if (cached) {
      res.json({ success: true, data: cached, meta: { fromCache: true } });
      return;
    }

    const result = await db.query(
      `SELECT db.*, d.name AS department_name
         FROM department_budgets db
         JOIN departments d ON d.id = db.department_id
         WHERE db.department_id = $1 AND db.fiscal_year = $2`,
      [departmentId, fy]
    );

    const data = shape(result.rows[0]);
    if (data) await cacheSet(cacheKey(departmentId, fy), data, TTL.BUDGET_SUMMARY);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── GET /budget/org-overview ─────────────────────────────────
export async function getOrgOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fy = (req.query.fiscalYear as string) || currentFiscalYear();
    const result = await db.query(
      `SELECT db.*, d.name AS department_name
         FROM department_budgets db
         JOIN departments d ON d.id = db.department_id
         WHERE db.fiscal_year = $1
         ORDER BY d.name`,
      [fy]
    );
    const rows = result.rows.map(shape);
    const totals = rows.reduce(
      (a, r) => {
        if (!r) return a;
        a.allocatedAnnual       += r.allocatedAnnual;
        a.consumed              += r.consumed;
        a.supplementaryApproved += r.supplementaryApproved;
        a.remaining             += r.remaining;
        return a;
      },
      { allocatedAnnual: 0, consumed: 0, supplementaryApproved: 0, remaining: 0 }
    );
    const pool = totals.allocatedAnnual + totals.supplementaryApproved;
    const overallUtilization = pool > 0 ? Math.round((totals.consumed / pool) * 10000) / 100 : 0;
    res.json({
      success: true,
      data: rows,
      meta: { fiscalYear: fy, totals: { ...totals, overallUtilization }, count: rows.length },
    });
  } catch (err) { next(err); }
}

// ─── GET /budget/:id ──────────────────────────────────────────
export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT db.*, d.name AS department_name
         FROM department_budgets db
         JOIN departments d ON d.id = db.department_id
         WHERE db.id = $1`,
      [req.params.id]
    );
    const data = shape(r.rows[0]);
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
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const r = await db.query(
      `SELECT h.id, h.action, h.amount, h.balance_after, h.note, h.travel_request_id, h.created_at,
              u.email AS actor_email, e.name AS actor_name, tr.request_code
         FROM department_budget_history h
         LEFT JOIN users u     ON u.id = h.actor_id
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN travel_requests tr ON tr.id = h.travel_request_id
         WHERE h.department_budget_id = $1
         ORDER BY h.created_at DESC
         LIMIT $2`,
      [req.params.id, limit]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
}

// ─── POST /budget — create or replace allocation ──────────────
export async function upsertAllocation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { departmentId, fiscalYear, allocatedAnnual } = req.body;
    const userId = req.user!.sub;

    if (!departmentId || !fiscalYear || allocatedAnnual === undefined) {
      res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'departmentId, fiscalYear, allocatedAnnual required.' } });
      return;
    }
    if (allocatedAnnual < 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Allocation must be ≥ 0.' } });
      return;
    }

    const out = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO department_budgets (department_id, fiscal_year, allocated_annual, last_updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (department_id, fiscal_year) DO UPDATE
           SET allocated_annual = EXCLUDED.allocated_annual,
               last_updated_by  = EXCLUDED.last_updated_by
         RETURNING *`,
        [departmentId, fiscalYear, allocatedAnnual, userId]
      );
      const b = inserted.rows[0];
      await client.query(
        `INSERT INTO department_budget_history
           (department_budget_id, action, amount, balance_after, actor_id, note)
         VALUES ($1, 'ALLOCATE', $2, $3, $4, $5)`,
        [b.id, allocatedAnnual,
         asNumber(b.allocated_annual) + asNumber(b.supplementary_approved) - asNumber(b.consumed),
         userId, 'Allocation set / updated']
      );
      return b;
    });

    await cacheDel(cacheKey(departmentId, fiscalYear));
    const full = await db.query(
      `SELECT db.*, d.name AS department_name FROM department_budgets db
        JOIN departments d ON d.id = db.department_id WHERE db.id = $1`,
      [out.id]
    );
    res.status(201).json({ success: true, data: shape(full.rows[0]) });
  } catch (err) { next(err); }
}

// ─── POST /budget/:id/adjust ──────────────────────────────────
export async function adjustBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { delta, note } = req.body;
    const userId = req.user!.sub;
    if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_DELTA', message: 'delta must be non-zero number.' } });
      return;
    }
    if (!note || String(note).trim().length < 10) {
      res.status(400).json({ success: false, error: { code: 'NOTE_REQUIRED', message: 'note ≥ 10 chars required for audit.' } });
      return;
    }

    const out = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE department_budgets
            SET allocated_annual = allocated_annual + $1, last_updated_by = $2
          WHERE id = $3 RETURNING *`,
        [delta, userId, req.params.id]
      );
      const b = r.rows[0];
      if (!b) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      await client.query(
        `INSERT INTO department_budget_history
           (department_budget_id, action, amount, balance_after, actor_id, note)
         VALUES ($1, 'ADJUST', $2, $3, $4, $5)`,
        [b.id, delta,
         asNumber(b.allocated_annual) + asNumber(b.supplementary_approved) - asNumber(b.consumed),
         userId, String(note).trim()]
      );
      return b;
    });

    await cacheDel(cacheKey(out.department_id, out.fiscal_year));
    const full = await db.query(
      `SELECT db.*, d.name AS department_name FROM department_budgets db
        JOIN departments d ON d.id = db.department_id WHERE db.id = $1`, [out.id]
    );
    res.json({ success: true, data: shape(full.rows[0]) });
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Budget not found.' } });
      return;
    }
    next(err);
  }
}

// ─── POST /budget/:id/consume — called from travel-request approve flow ───
export async function consumeBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { amount, travelRequestId, note } = req.body;
    const userId = req.user!.sub;
    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'amount must be > 0.' } });
      return;
    }
    const out = await withTransaction(async (client) => {
      const sel = await client.query(
        `SELECT * FROM department_budgets WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      const b = sel.rows[0];
      if (!b) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      const pool = asNumber(b.allocated_annual) + asNumber(b.supplementary_approved);
      if (asNumber(b.consumed) + amount > pool) {
        throw Object.assign(new Error('BUDGET_EXCEEDED'), { status: 409 });
      }
      const upd = await client.query(
        `UPDATE department_budgets
            SET consumed = consumed + $1, last_updated_by = $2
          WHERE id = $3 RETURNING *`,
        [amount, userId, b.id]
      );
      const bNew = upd.rows[0];
      await client.query(
        `INSERT INTO department_budget_history
           (department_budget_id, action, amount, balance_after, actor_id, travel_request_id, note)
         VALUES ($1, 'CONSUME', $2, $3, $4, $5, $6)`,
        [b.id, amount,
         asNumber(bNew.allocated_annual) + asNumber(bNew.supplementary_approved) - asNumber(bNew.consumed),
         userId, travelRequestId || null, note || null]
      );
      return bNew;
    });

    await cacheDel(cacheKey(out.department_id, out.fiscal_year));
    res.json({ success: true, data: shape(out) });
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

// ─── Addition Requests (HOD raises, Admin decides) ────────────
export async function listAdditionRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const userId = req.user!.sub;
    const status = (req.query.status as string) || null;
    const params: unknown[] = [];
    const where: string[] = [];
    if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
    // Non-Admin/Owner can only see their own requests
    if (role !== UserRole.ADMIN && role !== UserRole.OWNER) {
      params.push(userId);
      where.push(`r.requested_by = $${params.length}`);
    }
    const sql = `
      SELECT r.*, db.department_id, db.fiscal_year, d.name AS department_name,
             eu.email AS requested_by_email, e.name AS requested_by_name
        FROM budget_addition_requests r
        JOIN department_budgets db ON db.id = r.department_budget_id
        JOIN departments d         ON d.id  = db.department_id
        JOIN users eu              ON eu.id = r.requested_by
        LEFT JOIN employees e      ON e.user_id = r.requested_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY r.created_at DESC
        LIMIT 100`;
    const result = await db.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

export async function requestAddition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { departmentBudgetId, amount, reason } = req.body;
    const userId = req.user!.sub;
    if (!departmentBudgetId) {
      res.status(400).json({ success: false, error: { code: 'BUDGET_REQUIRED', message: 'departmentBudgetId required.' } });
      return;
    }
    if (!amount || amount <= 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive.' } });
      return;
    }
    if (!reason || String(reason).trim().length < 20) {
      res.status(400).json({ success: false, error: { code: 'REASON_TOO_SHORT', message: 'Reason must be ≥ 20 chars.' } });
      return;
    }

    const out = await db.query(
      `INSERT INTO budget_addition_requests (department_budget_id, requested_by, amount, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [departmentBudgetId, userId, amount, String(reason).trim()]
    );
    res.status(201).json({ success: true, data: out.rows[0], message: 'Budget addition request submitted.' });
  } catch (err) { next(err); }
}

export async function decideAddition(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { action, note } = req.body; // 'APPROVE' | 'REJECT'
    const userId = req.user!.sub;
    if (!['APPROVE', 'REJECT'].includes(action)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ACTION', message: 'Action must be APPROVE or REJECT.' } });
      return;
    }
    const sel = await db.query(
      `SELECT * FROM budget_addition_requests WHERE id = $1`, [req.params.id]
    );
    const r = sel.rows[0];
    if (!r) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found.' } });
      return;
    }
    if (r.status !== 'PENDING') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_DECIDED', message: `Already ${r.status}.` } });
      return;
    }
    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE budget_addition_requests
            SET status = $1, decision_by = $2, decision_note = $3, decision_at = NOW()
          WHERE id = $4`,
        [newStatus, userId, note ?? null, r.id]
      );

      if (action === 'APPROVE') {
        await client.query(
          `UPDATE department_budgets
              SET supplementary_approved = supplementary_approved + $1,
                  last_updated_by = $2
            WHERE id = $3`,
          [r.amount, userId, r.department_budget_id]
        );
        await client.query(
          `INSERT INTO department_budget_history
             (department_budget_id, action, amount, balance_after, actor_id, note)
           SELECT $1, 'SUPPLEMENT', $2,
                  (allocated_annual + supplementary_approved - consumed), $3, $4
             FROM department_budgets WHERE id = $1`,
          [r.department_budget_id, r.amount, userId, `Addition approved: ${r.id}`]
        );
        const bm = await client.query(
          `SELECT department_id, fiscal_year FROM department_budgets WHERE id = $1`,
          [r.department_budget_id]
        );
        if (bm.rows[0]) await cacheDel(cacheKey(bm.rows[0].department_id, bm.rows[0].fiscal_year));
      }
    });

    logger.info(`Budget addition ${r.id} ${newStatus} by ${userId}`);
    res.json({ success: true, message: `Request ${action.toLowerCase()}d.` });
  } catch (err) { next(err); }
}
