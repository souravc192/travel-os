import { Request, Response, NextFunction } from 'express';
import db, { withTransaction, buildPaginationClause } from '../config/db';
import { storage } from '../config/storage';
import { logger } from '../config/logger';
import {
  UserRole, ReimbursementKind, ReimbursementStatus,
} from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function bad(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function asNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function canAdmin(role: UserRole): boolean {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}

function shape(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:                    row.id,
    reimbursementCode:     row.reimbursement_code,
    kind:                  row.kind,
    status:                row.status,
    submittedByUserId:     row.submitted_by_user_id,
    employeeId:            row.employee_id,
    employeeCode:          row.employee_code,
    employeeName:          row.employee_name,
    departmentId:          row.department_id,
    departmentName:        row.department_name ?? null,
    travelRequestId:       row.travel_request_id,
    travelRequestCode:     row.travel_request_code,
    title:                 row.title,
    description:           row.description,
    currency:              row.currency,
    totalClaimed:          asNumber(row.total_claimed),
    totalApproved:         asNumber(row.total_approved),
    decisionNote:          row.decision_note,
    decidedBy:             row.decided_by,
    decidedAt:             row.decided_at,
    paidReference:         row.paid_reference,
    paidBy:                row.paid_by,
    paidAt:                row.paid_at,
    submittedAt:           row.submitted_at,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
    itemCount:             row.item_count ?? null,
  };
}

function shapeItem(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:                       row.id,
    reimbursementId:          row.reimbursement_id,
    sequenceNo:               row.sequence_no,
    categoryId:               row.category_id,
    categoryName:             row.category_name ?? null,
    expenseDate:              row.expense_date,
    description:              row.description,
    claimedAmount:            asNumber(row.claimed_amount),
    approvedAmount:           row.approved_amount != null ? asNumber(row.approved_amount) : null,
    receiptPath:              row.receipt_path,
    receiptOriginalFilename:  row.receipt_original_filename,
    receiptUploadedAt:        row.receipt_uploaded_at,
    notes:                    row.notes,
    createdAt:                row.created_at,
    updatedAt:                row.updated_at,
  };
}

// User can see a reimbursement if:
//   - they submitted it
//   - OR they are Admin/Owner/Travel Team (org-wide visibility)
async function canSee(
  userId: string, role: UserRole, reimbursementId: string
): Promise<boolean> {
  if (role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.TRAVEL_TEAM) return true;
  const r = await db.query(
    `SELECT 1 FROM reimbursements WHERE id = $1 AND submitted_by_user_id = $2`,
    [reimbursementId, userId]
  );
  return Boolean(r.rows[0]);
}

// Caller can edit a DRAFT reimbursement if they own it (or Admin/Owner)
async function canEditDraft(
  userId: string, role: UserRole, reimbursementId: string
): Promise<{ ok: boolean; status?: string }> {
  const r = await db.query(
    `SELECT status, submitted_by_user_id FROM reimbursements WHERE id = $1`,
    [reimbursementId]
  );
  const row = r.rows[0];
  if (!row) return { ok: false };
  if (row.status !== 'DRAFT') return { ok: false, status: row.status };
  if (row.submitted_by_user_id === userId) return { ok: true };
  if (canAdmin(role)) return { ok: true };
  return { ok: false };
}

// Recompute totals from items
async function recomputeTotals(client: { query: typeof db.query }, reimbursementId: string): Promise<void> {
  await client.query(
    `UPDATE reimbursements r
        SET total_claimed  = COALESCE((SELECT SUM(claimed_amount) FROM reimbursement_items WHERE reimbursement_id = r.id), 0),
            total_approved = COALESCE((SELECT SUM(approved_amount) FROM reimbursement_items WHERE reimbursement_id = r.id), 0)
      WHERE r.id = $1`,
    [reimbursementId]
  );
}

// ─── GET /reimbursement-categories ────────────────────────────
export async function listCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const r = await db.query(
      `SELECT * FROM reimbursement_categories
        ${includeInactive ? '' : 'WHERE is_active = true'}
        ORDER BY name`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
}

// ─── POST /reimbursement-categories (Admin/Owner) ─────────────
export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canAdmin(req.user!.role)) return bad(res, 'FORBIDDEN', 'Admin/Owner only.', 403);
    const { name, description } = req.body ?? {};
    if (!name || String(name).trim().length < 2) return bad(res, 'NAME_REQUIRED', 'Category name (≥ 2 chars) required.');
    const r = await db.query(
      `INSERT INTO reimbursement_categories (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [String(name).trim(), description ?? null, req.user!.sub]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === '23505') return bad(res, 'DUPLICATE', 'A category with that name already exists.', 409);
    next(err);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canAdmin(req.user!.role)) return bad(res, 'FORBIDDEN', 'Admin/Owner only.', 403);
    const { name, description, isActive } = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    function add(col: string, val: unknown) {
      if (val !== undefined) { params.push(val); updates.push(`${col} = $${params.length}`); }
    }
    add('name',        name);
    add('description', description);
    add('is_active',   isActive);
    if (updates.length === 0) return bad(res, 'NO_UPDATES', 'No fields to update.');
    params.push(req.params.id);
    const r = await db.query(
      `UPDATE reimbursement_categories SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!r.rows[0]) return bad(res, 'NOT_FOUND', 'Category not found.', 404);
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === '23505') return bad(res, 'DUPLICATE', 'A category with that name already exists.', 409);
    next(err);
  }
}

// ─── POST /reimbursements — create draft (with optional items) ──
export async function createReimbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const b = req.body ?? {};
    const title = String(b.title ?? '').trim();
    if (!title) return bad(res, 'TITLE_REQUIRED', 'title is required.');
    if (!Object.values(ReimbursementKind).includes(b.kind))
      return bad(res, 'INVALID_KIND', `kind must be one of: ${Object.values(ReimbursementKind).join(', ')}.`);

    // Travel-linked → must have valid travel_request_id, snapshot code
    let travelRequestId: string | null = null;
    let travelRequestCode: string | null = null;
    if (b.kind === ReimbursementKind.TRAVEL_LINKED) {
      if (!isUuid(b.travelRequestId)) return bad(res, 'TR_REQUIRED', 'travelRequestId (UUID) required for TRAVEL_LINKED.');
      const tr = await db.query(`SELECT id, request_code FROM travel_requests WHERE id = $1`, [b.travelRequestId]);
      if (!tr.rows[0]) return bad(res, 'TR_NOT_FOUND', 'Linked travel request not found.', 404);
      travelRequestId   = tr.rows[0].id;
      travelRequestCode = tr.rows[0].request_code;
    }

    // Snapshot submitter's employee/department for fast list rendering
    const empRes = await db.query(
      `SELECT e.id, e.name, e.employee_code, e.department_id
         FROM employees e WHERE e.user_id = $1 LIMIT 1`,
      [userId]
    );
    const emp = empRes.rows[0] ?? {};

    // Validate items if provided
    const itemsRaw = Array.isArray(b.items) ? b.items : [];
    for (let i = 0; i < itemsRaw.length; i++) {
      const it = itemsRaw[i];
      if (!isUuid(it?.categoryId))     return bad(res, 'ITEM_BAD', `Item ${i + 1}: categoryId required.`);
      if (!it?.expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(it.expenseDate))
        return bad(res, 'ITEM_BAD', `Item ${i + 1}: expenseDate must be YYYY-MM-DD.`);
      const amt = asNumber(it?.claimedAmount);
      if (amt <= 0) return bad(res, 'ITEM_BAD', `Item ${i + 1}: claimedAmount must be > 0.`);
      if (!String(it?.description ?? '').trim())
        return bad(res, 'ITEM_BAD', `Item ${i + 1}: description required.`);
    }

    const out = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO reimbursements (
            kind, status,
            submitted_by_user_id, employee_id, employee_code, employee_name, department_id,
            travel_request_id, travel_request_code,
            title, description, currency
         ) VALUES (
            $1, 'DRAFT',
            $2, $3, $4, $5, $6,
            $7, $8,
            $9, $10, 'INR'
         ) RETURNING *`,
        [
          b.kind,
          userId, emp.id ?? null, emp.employee_code ?? null, emp.name ?? null, emp.department_id ?? null,
          travelRequestId, travelRequestCode,
          title, b.description ?? null,
        ]
      );
      const r = ins.rows[0];

      // Insert items
      for (let i = 0; i < itemsRaw.length; i++) {
        const it = itemsRaw[i];
        await client.query(
          `INSERT INTO reimbursement_items
             (reimbursement_id, sequence_no, category_id, expense_date,
              description, claimed_amount, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [r.id, i + 1, it.categoryId, it.expenseDate,
           String(it.description).trim(), asNumber(it.claimedAmount), it.notes ?? null]
        );
      }
      if (itemsRaw.length > 0) await recomputeTotals(client, r.id);
      return r;
    });

    logger.info(`Reimbursement ${out.reimbursement_code} created (DRAFT) by ${userId}`);
    res.status(201).json({ success: true, data: shape(out) });
  } catch (err) { next(err); }
}

// ─── PATCH /reimbursements/:id — edit header while DRAFT ──────
export async function updateReimbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const guard = await canEditDraft(userId, req.user!.role, req.params.id);
    if (!guard.ok) {
      if (guard.status) return bad(res, 'NOT_EDITABLE', `Cannot edit a ${guard.status} reimbursement.`, 409);
      return bad(res, 'FORBIDDEN', 'Cannot edit this reimbursement.', 403);
    }

    const { title, description } = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    function add(col: string, val: unknown) {
      if (val !== undefined) { params.push(val); updates.push(`${col} = $${params.length}`); }
    }
    add('title',       title);
    add('description', description);
    if (updates.length === 0) return bad(res, 'NO_UPDATES', 'No editable fields provided.');
    params.push(req.params.id);
    const r = await db.query(
      `UPDATE reimbursements SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ success: true, data: shape(r.rows[0]) });
  } catch (err) { next(err); }
}

// ─── POST /reimbursements/:id/submit — DRAFT → SUBMITTED ──────
export async function submitReimbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT id, submitted_by_user_id, status FROM reimbursements WHERE id = $1`,
      [req.params.id]
    );
    const row = r.rows[0];
    if (!row) return bad(res, 'NOT_FOUND', 'Reimbursement not found.', 404);
    if (row.submitted_by_user_id !== req.user!.sub && !canAdmin(req.user!.role))
      return bad(res, 'FORBIDDEN', 'Only the claimant or Admin/Owner can submit.', 403);
    if (row.status !== 'DRAFT') return bad(res, 'NOT_DRAFT', `Status is ${row.status}, cannot submit.`, 409);

    const itemCount = await db.query(
      `SELECT COUNT(*)::INT AS n FROM reimbursement_items WHERE reimbursement_id = $1`,
      [row.id]
    );
    if (!itemCount.rows[0].n) return bad(res, 'NO_ITEMS', 'Add at least one item before submitting.', 409);

    const upd = await db.query(
      `UPDATE reimbursements
          SET status = 'SUBMITTED', submitted_at = NOW()
        WHERE id = $1 RETURNING *`,
      [row.id]
    );
    res.json({ success: true, data: shape(upd.rows[0]), message: 'Submitted for review.' });
  } catch (err) { next(err); }
}

// ─── POST /reimbursements/:id/decide — APPROVE / REJECT (Admin/Owner) ──
// Body: { action: 'APPROVE'|'REJECT', note?: string, itemApprovals?: [{ id, approvedAmount }] }
export async function decideReimbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canAdmin(req.user!.role)) return bad(res, 'FORBIDDEN', 'Admin/Owner only.', 403);
    const userId = req.user!.sub;
    const { action, note, itemApprovals } = req.body ?? {};
    if (!['APPROVE', 'REJECT'].includes(action))
      return bad(res, 'INVALID_ACTION', 'action must be APPROVE or REJECT.');
    if (action === 'REJECT' && String(note ?? '').trim().length < 5)
      return bad(res, 'NOTE_REQUIRED', 'Rejection note (≥ 5 chars) required.');

    const out = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM reimbursements WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const row = r.rows[0];
      if (!row) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (row.status !== 'SUBMITTED')
        throw Object.assign(new Error('WRONG_STATE'), { status: 409, msg: `Status is ${row.status}.` });

      if (action === 'APPROVE') {
        // Default: approve each item at its claimed amount unless overridden
        const items = await client.query(
          `SELECT id, claimed_amount FROM reimbursement_items WHERE reimbursement_id = $1`,
          [row.id]
        );
        const overrides = new Map<string, number>(
          Array.isArray(itemApprovals)
            ? itemApprovals
                .filter((x: unknown): x is { id: string; approvedAmount: number } => {
                  if (typeof x !== 'object' || x === null) return false;
                  const o = x as { id?: unknown; approvedAmount?: unknown };
                  return typeof o.id === 'string' && Number.isFinite(Number(o.approvedAmount));
                })
                .map((x) => [x.id, Number(x.approvedAmount)])
            : []
        );
        for (const it of items.rows) {
          const approved = overrides.has(it.id) ? overrides.get(it.id)! : asNumber(it.claimed_amount);
          if (approved < 0 || approved > asNumber(it.claimed_amount)) {
            throw Object.assign(new Error('BAD_APPROVAL'), { status: 400,
              msg: `Item ${it.id}: approvedAmount must be between 0 and the claimed amount.` });
          }
          await client.query(
            `UPDATE reimbursement_items SET approved_amount = $1 WHERE id = $2`,
            [approved, it.id]
          );
        }
      }

      const upd = await client.query(
        `UPDATE reimbursements
            SET status = $1, decision_note = $2, decided_by = $3, decided_at = NOW()
          WHERE id = $4 RETURNING *`,
        [action === 'APPROVE' ? 'APPROVED' : 'REJECTED', note ?? null, userId, row.id]
      );
      await recomputeTotals(client, row.id);
      // Re-fetch with refreshed totals
      const fresh = await client.query(`SELECT * FROM reimbursements WHERE id = $1`, [row.id]);
      return fresh.rows[0];
    });

    logger.info(`Reimbursement ${out.reimbursement_code} ${action} by ${userId}`);
    res.json({ success: true, data: shape(out), message: `Request ${action.toLowerCase()}d.` });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 400) return bad(res, 'BAD_INPUT', msg ?? 'Invalid input.');
    if (status === 404) return bad(res, 'NOT_FOUND', 'Reimbursement not found.', 404);
    if (status === 409) return bad(res, 'WRONG_STATE', msg ?? 'Cannot decide on this reimbursement.', 409);
    next(err);
  }
}

// ─── POST /reimbursements/:id/pay — APPROVED → PAID (Admin/Owner) ──
export async function markPaid(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canAdmin(req.user!.role)) return bad(res, 'FORBIDDEN', 'Admin/Owner only.', 403);
    const userId = req.user!.sub;
    const ref = String(req.body?.paidReference ?? '').trim();
    if (!ref) return bad(res, 'REF_REQUIRED', 'paidReference (e.g. UTR / transfer ref) required.');

    const r = await db.query(
      `UPDATE reimbursements
          SET status = 'PAID', paid_reference = $1, paid_by = $2, paid_at = NOW()
        WHERE id = $3 AND status = 'APPROVED'
        RETURNING *`,
      [ref, userId, req.params.id]
    );
    if (!r.rows[0]) return bad(res, 'WRONG_STATE', 'Reimbursement must be APPROVED to mark paid.', 409);
    res.json({ success: true, data: shape(r.rows[0]), message: 'Marked as paid.' });
  } catch (err) { next(err); }
}

// ─── POST /reimbursements/:id/cancel — claimant cancels DRAFT or SUBMITTED ──
export async function cancelReimbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const r = await db.query(
      `SELECT id, status, submitted_by_user_id FROM reimbursements WHERE id = $1`,
      [req.params.id]
    );
    const row = r.rows[0];
    if (!row) return bad(res, 'NOT_FOUND', 'Reimbursement not found.', 404);
    if (row.submitted_by_user_id !== userId && !canAdmin(req.user!.role))
      return bad(res, 'FORBIDDEN', 'Only the claimant or Admin/Owner can cancel.', 403);
    if (!['DRAFT', 'SUBMITTED'].includes(row.status))
      return bad(res, 'WRONG_STATE', `Cannot cancel a ${row.status} reimbursement.`, 409);

    // Cancellation simply rejects with a note for audit
    const note = String(req.body?.reason ?? 'Cancelled by claimant').slice(0, 500);
    const upd = await db.query(
      `UPDATE reimbursements
          SET status = 'REJECTED', decision_note = $1, decided_by = $2, decided_at = NOW()
        WHERE id = $3 RETURNING *`,
      [`[CANCELLED] ${note}`, userId, row.id]
    );
    res.json({ success: true, data: shape(upd.rows[0]) });
  } catch (err) { next(err); }
}

// ─── GET /reimbursements ──────────────────────────────────────
// Scoping:
//   USER / HOD  — only own
//   TRAVEL_TEAM / ADMIN / OWNER — all
export async function listReimbursements(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const userId = req.user!.sub;
    const { page = 1, limit = 20, status, kind, search } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where: string[] = [];
    const params: unknown[] = [];
    if (role === UserRole.USER || role === UserRole.HOD) {
      params.push(userId);
      where.push(`r.submitted_by_user_id = $${params.length}`);
    }
    if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
    if (kind)   { params.push(kind);   where.push(`r.kind = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(r.reimbursement_code ILIKE $${params.length}
                 OR r.title ILIKE $${params.length}
                 OR r.employee_name ILIKE $${params.length}
                 OR r.travel_request_code ILIKE $${params.length})`);
    }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, offset);

    const data = await db.query(
      `SELECT r.*, d.name AS department_name,
              (SELECT COUNT(*) FROM reimbursement_items WHERE reimbursement_id = r.id)::INT AS item_count
         FROM reimbursements r
         LEFT JOIN departments d ON d.id = r.department_id
         ${whereSQL}
         ORDER BY r.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await db.query(
      `SELECT COUNT(*) FROM reimbursements r ${whereSQL}`,
      params.slice(0, -2)
    );
    res.json({
      success: true,
      data: data.rows.map(shape),
      meta: { page: +page, limit: lim, total: +count.rows[0].count },
    });
  } catch (err) { next(err); }
}

// ─── GET /reimbursements/:id ──────────────────────────────────
export async function getReimbursement(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!await canSee(req.user!.sub, req.user!.role, req.params.id)) {
      return bad(res, 'FORBIDDEN', 'Not allowed to view this reimbursement.', 403);
    }
    const [hdr, items] = await Promise.all([
      db.query(
        `SELECT r.*, d.name AS department_name
           FROM reimbursements r
           LEFT JOIN departments d ON d.id = r.department_id
          WHERE r.id = $1`,
        [req.params.id]
      ),
      db.query(
        `SELECT i.*, c.name AS category_name
           FROM reimbursement_items i
           JOIN reimbursement_categories c ON c.id = i.category_id
          WHERE i.reimbursement_id = $1
          ORDER BY i.sequence_no`,
        [req.params.id]
      ),
    ]);
    if (!hdr.rows[0]) return bad(res, 'NOT_FOUND', 'Reimbursement not found.', 404);
    res.json({
      success: true,
      data: { ...shape(hdr.rows[0]), items: items.rows.map(shapeItem) },
    });
  } catch (err) { next(err); }
}

// ─── POST /reimbursements/:id/items — add item while DRAFT ────
export async function addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guard = await canEditDraft(req.user!.sub, req.user!.role, req.params.id);
    if (!guard.ok) {
      if (guard.status) return bad(res, 'NOT_EDITABLE', `Cannot edit a ${guard.status} reimbursement.`, 409);
      return bad(res, 'FORBIDDEN', 'Cannot edit this reimbursement.', 403);
    }
    const b = req.body ?? {};
    if (!isUuid(b.categoryId)) return bad(res, 'CATEGORY_REQUIRED', 'categoryId is required.');
    if (!b.expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(b.expenseDate))
      return bad(res, 'DATE_REQUIRED', 'expenseDate must be YYYY-MM-DD.');
    const amt = asNumber(b.claimedAmount);
    if (amt <= 0) return bad(res, 'AMOUNT_REQUIRED', 'claimedAmount must be > 0.');
    const desc = String(b.description ?? '').trim();
    if (!desc) return bad(res, 'DESC_REQUIRED', 'description is required.');

    const out = await withTransaction(async (client) => {
      const nextSeq = await client.query(
        `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS n FROM reimbursement_items WHERE reimbursement_id = $1`,
        [req.params.id]
      );
      const r = await client.query(
        `INSERT INTO reimbursement_items
           (reimbursement_id, sequence_no, category_id, expense_date,
            description, claimed_amount, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.params.id, nextSeq.rows[0].n, b.categoryId, b.expenseDate, desc, amt, b.notes ?? null]
      );
      await recomputeTotals(client, req.params.id);
      return r.rows[0];
    });
    res.status(201).json({ success: true, data: shapeItem(out) });
  } catch (err) { next(err); }
}

// ─── PATCH /reimbursement-items/:id ───────────────────────────
export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const it = await db.query(`SELECT reimbursement_id FROM reimbursement_items WHERE id = $1`, [req.params.id]);
    const row = it.rows[0];
    if (!row) return bad(res, 'NOT_FOUND', 'Item not found.', 404);
    const guard = await canEditDraft(req.user!.sub, req.user!.role, row.reimbursement_id);
    if (!guard.ok) {
      if (guard.status) return bad(res, 'NOT_EDITABLE', `Cannot edit a ${guard.status} reimbursement.`, 409);
      return bad(res, 'FORBIDDEN', 'Cannot edit this item.', 403);
    }

    const b = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    function add(col: string, val: unknown) {
      if (val !== undefined) { params.push(val); updates.push(`${col} = $${params.length}`); }
    }
    add('category_id',     b.categoryId);
    add('expense_date',    b.expenseDate);
    add('description',     b.description);
    add('claimed_amount',  b.claimedAmount != null ? asNumber(b.claimedAmount) : undefined);
    add('notes',           b.notes);
    if (updates.length === 0) return bad(res, 'NO_UPDATES', 'No fields to update.');

    const out = await withTransaction(async (client) => {
      params.push(req.params.id);
      const r = await client.query(
        `UPDATE reimbursement_items SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      await recomputeTotals(client, row.reimbursement_id);
      return r.rows[0];
    });
    res.json({ success: true, data: shapeItem(out) });
  } catch (err) { next(err); }
}

// ─── DELETE /reimbursement-items/:id ──────────────────────────
export async function deleteItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const it = await db.query(`SELECT reimbursement_id, receipt_path FROM reimbursement_items WHERE id = $1`, [req.params.id]);
    const row = it.rows[0];
    if (!row) return bad(res, 'NOT_FOUND', 'Item not found.', 404);
    const guard = await canEditDraft(req.user!.sub, req.user!.role, row.reimbursement_id);
    if (!guard.ok) {
      if (guard.status) return bad(res, 'NOT_EDITABLE', `Cannot edit a ${guard.status} reimbursement.`, 409);
      return bad(res, 'FORBIDDEN', 'Cannot delete this item.', 403);
    }
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM reimbursement_items WHERE id = $1`, [req.params.id]);
      await recomputeTotals(client, row.reimbursement_id);
    });
    if (row.receipt_path) await storage.remove(row.receipt_path).catch(() => {});
    res.json({ success: true, message: 'Item removed.' });
  } catch (err) { next(err); }
}

// ─── POST /reimbursement-items/:id/receipt — multipart upload ──
export async function uploadReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const it = await db.query(`SELECT reimbursement_id, receipt_path FROM reimbursement_items WHERE id = $1`, [req.params.id]);
    const row = it.rows[0];
    if (!row) return bad(res, 'NOT_FOUND', 'Item not found.', 404);
    const guard = await canEditDraft(req.user!.sub, req.user!.role, row.reimbursement_id);
    if (!guard.ok) {
      if (guard.status) return bad(res, 'NOT_EDITABLE', `Cannot edit a ${guard.status} reimbursement.`, 409);
      return bad(res, 'FORBIDDEN', 'Cannot edit this item.', 403);
    }
    if (!req.file) return bad(res, 'NO_FILE', 'Upload the receipt under field "file".');

    const ym = new Date().toISOString().slice(0, 7).replace('-', '/');
    const put = await storage.put(`receipts/${ym}`, req.file.originalname, req.file.buffer);

    const upd = await db.query(
      `UPDATE reimbursement_items
          SET receipt_path = $1, receipt_original_filename = $2, receipt_uploaded_at = NOW()
        WHERE id = $3 RETURNING *`,
      [put.key, req.file.originalname, req.params.id]
    );
    // Best-effort: drop the previous receipt if any
    if (row.receipt_path) await storage.remove(row.receipt_path).catch(() => {});
    res.json({ success: true, data: shapeItem(upd.rows[0]), message: 'Receipt uploaded.' });
  } catch (err) { next(err); }
}

// ─── GET /reimbursement-items/:id/receipt — auth download ─────
export async function downloadReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT i.receipt_path, i.receipt_original_filename, i.reimbursement_id
         FROM reimbursement_items i WHERE i.id = $1`,
      [req.params.id]
    );
    const row = r.rows[0];
    if (!row || !row.receipt_path) return bad(res, 'NOT_FOUND', 'Receipt not found.', 404);
    if (!await canSee(req.user!.sub, req.user!.role, row.reimbursement_id)) {
      return bad(res, 'FORBIDDEN', 'Not allowed to download this receipt.', 403);
    }
    const { stream, size } = await storage.read(row.receipt_path);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Content-Disposition',
      `inline; filename="${(row.receipt_original_filename ?? 'receipt').replace(/"/g, '')}"`);
    stream.pipe(res);
  } catch (err) { next(err); }
}
