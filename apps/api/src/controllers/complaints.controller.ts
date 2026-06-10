import { Request, Response, NextFunction } from 'express';
import db, { withTransaction, buildPaginationClause } from '../config/db';
import { logger } from '../config/logger';
import {
  UserRole, ComplaintPriority, ComplaintStatus, COMPLAINT_SLA_HOURS,
} from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function bad(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isManager(role: UserRole): boolean {
  return role === UserRole.OWNER || role === UserRole.ADMIN || role === UserRole.TRAVEL_TEAM;
}

function shape(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:                    row.id,
    complaintCode:         row.complaint_code,
    raisedByUserId:        row.raised_by_user_id,
    employeeId:            row.employee_id,
    employeeName:          row.employee_name,
    departmentId:          row.department_id,
    departmentName:        row.department_name ?? null,
    travelRequestId:       row.travel_request_id,
    travelRequestCode:     row.travel_request_code,
    bookingId:             row.booking_id,
    vendorName:            row.vendor_name,
    category:              row.category,
    priority:              row.priority,
    status:                row.status,
    subject:               row.subject,
    description:           row.description,
    slaDueAt:              row.sla_due_at,
    resolutionOwnerUserId: row.resolution_owner_user_id,
    resolutionOwnerName:   row.resolution_owner_name ?? null,
    assignedBy:            row.assigned_by,
    assignedAt:            row.assigned_at,
    resolutionNote:        row.resolution_note,
    resolvedBy:            row.resolved_by,
    resolvedAt:            row.resolved_at,
    closedBy:              row.closed_by,
    closedAt:              row.closed_at,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
  };
}

function shapeUpdate(row: Record<string, unknown>) {
  return {
    id:           row.id,
    complaintId:  row.complaint_id,
    authorUserId: row.author_user_id,
    authorName:   row.author_name,
    kind:         row.kind,
    body:         row.body,
    fromStatus:   row.from_status,
    toStatus:     row.to_status,
    createdAt:    row.created_at,
  };
}

// Does the caller's name we snapshot onto updates
async function callerName(userId: string): Promise<string | null> {
  const r = await db.query(
    `SELECT e.name FROM employees e WHERE e.user_id = $1 LIMIT 1`, [userId]
  );
  return r.rows[0]?.name ?? null;
}

// Visibility: raiser, resolution owner, or any manager.
async function canSee(userId: string, role: UserRole, complaintId: string): Promise<boolean> {
  if (isManager(role)) return true;
  const r = await db.query(
    `SELECT 1 FROM complaints
      WHERE id = $1 AND (raised_by_user_id = $2 OR resolution_owner_user_id = $2)`,
    [complaintId, userId]
  );
  return Boolean(r.rows[0]);
}

// ─── GET /complaints/assignable-users ─────────────────────────
// Travel Desk picks a Resolution Owner from staff (TT / Admin / Owner).
export async function listAssignableUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isManager(req.user!.role)) return bad(res, 'FORBIDDEN', 'Not allowed.', 403);
    const r = await db.query(
      `SELECT u.id, u.email, u.role, e.name, d.name AS department_name
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN departments d ON d.id = e.department_id
        WHERE u.is_active = true
          AND u.role IN ('TRAVEL_TEAM', 'ADMIN', 'OWNER')
        ORDER BY e.name NULLS LAST, u.email`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) { next(err); }
}

// ─── POST /complaints ─────────────────────────────────────────
export async function createComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const b = req.body ?? {};

    const subject = String(b.subject ?? '').trim();
    const description = String(b.description ?? '').trim();
    const category = String(b.category ?? '').trim();
    if (!subject)     return bad(res, 'SUBJECT_REQUIRED', 'subject is required.');
    if (description.length < 10) return bad(res, 'DESC_REQUIRED', 'description (≥ 10 chars) is required.');
    if (!category)    return bad(res, 'CATEGORY_REQUIRED', 'category is required.');

    const priority: ComplaintPriority = Object.values(ComplaintPriority).includes(b.priority)
      ? b.priority : ComplaintPriority.MEDIUM;

    // Optional travel-request link → snapshot code; optional booking → snapshot vendor
    let travelRequestId: string | null = null;
    let travelRequestCode: string | null = null;
    if (b.travelRequestId) {
      if (!isUuid(b.travelRequestId)) return bad(res, 'TR_INVALID', 'travelRequestId must be a UUID.');
      const tr = await db.query(`SELECT id, request_code FROM travel_requests WHERE id = $1`, [b.travelRequestId]);
      if (!tr.rows[0]) return bad(res, 'TR_NOT_FOUND', 'Linked travel request not found.', 404);
      travelRequestId   = tr.rows[0].id;
      travelRequestCode = tr.rows[0].request_code;
    }

    let bookingId: string | null = null;
    let vendorName: string | null = b.vendorName ? String(b.vendorName).trim() : null;
    if (b.bookingId) {
      if (!isUuid(b.bookingId)) return bad(res, 'BOOKING_INVALID', 'bookingId must be a UUID.');
      const bk = await db.query(`SELECT id, vendor_name FROM bookings WHERE id = $1`, [b.bookingId]);
      if (!bk.rows[0]) return bad(res, 'BOOKING_NOT_FOUND', 'Linked booking not found.', 404);
      bookingId  = bk.rows[0].id;
      vendorName = vendorName || bk.rows[0].vendor_name;  // prefer explicit, else booking's
    }

    // Snapshot raiser's employee/department
    const empRes = await db.query(
      `SELECT e.id, e.name, e.department_id FROM employees e WHERE e.user_id = $1 LIMIT 1`,
      [userId]
    );
    const emp = empRes.rows[0] ?? {};

    // SLA due = now + priority window
    const slaHours = COMPLAINT_SLA_HOURS[priority];

    const ins = await db.query(
      `INSERT INTO complaints (
          raised_by_user_id, employee_id, employee_name, department_id,
          travel_request_id, travel_request_code, booking_id, vendor_name,
          category, priority, status, subject, description,
          sla_due_at
       ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, 'OPEN', $11, $12,
          NOW() + ($13 || ' hours')::interval
       ) RETURNING *`,
      [
        userId, emp.id ?? null, emp.name ?? null, emp.department_id ?? null,
        travelRequestId, travelRequestCode, bookingId, vendorName,
        category, priority, subject, description,
        String(slaHours),
      ]
    );

    logger.info(`Complaint ${ins.rows[0].complaint_code} raised by ${userId}`);
    res.status(201).json({ success: true, data: shape(ins.rows[0]) });
  } catch (err) { next(err); }
}

// ─── GET /complaints ──────────────────────────────────────────
export async function listComplaints(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const userId = req.user!.sub;
    const { page = 1, limit = 20, status, priority, search, mine } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where: string[] = [];
    const params: unknown[] = [];

    if (!isManager(role)) {
      // Non-managers see complaints they raised or are assigned to resolve
      params.push(userId);
      where.push(`(c.raised_by_user_id = $${params.length} OR c.resolution_owner_user_id = $${params.length})`);
    } else if (mine === 'true') {
      // Managers can opt into "assigned to me"
      params.push(userId);
      where.push(`c.resolution_owner_user_id = $${params.length}`);
    }

    if (status)   { params.push(status);   where.push(`c.status = $${params.length}`); }
    if (priority) { params.push(priority); where.push(`c.priority = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(c.complaint_code ILIKE $${params.length}
                 OR c.subject ILIKE $${params.length}
                 OR c.vendor_name ILIKE $${params.length}
                 OR c.employee_name ILIKE $${params.length}
                 OR c.travel_request_code ILIKE $${params.length})`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, offset);

    const data = await db.query(
      `SELECT c.*, d.name AS department_name, e.name AS resolution_owner_name
         FROM complaints c
         LEFT JOIN departments d ON d.id = c.department_id
         LEFT JOIN employees e ON e.user_id = c.resolution_owner_user_id
         ${whereSQL}
         ORDER BY
           CASE c.status WHEN 'CLOSED' THEN 1 ELSE 0 END,  -- open items first
           c.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await db.query(
      `SELECT COUNT(*) FROM complaints c ${whereSQL}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: data.rows.map(shape),
      meta: { page: +page, limit: lim, total: +count.rows[0].count },
    });
  } catch (err) { next(err); }
}

// ─── GET /complaints/:id ──────────────────────────────────────
export async function getComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!await canSee(req.user!.sub, req.user!.role, req.params.id))
      return bad(res, 'FORBIDDEN', 'Not allowed to view this complaint.', 403);

    const [hdr, updates] = await Promise.all([
      db.query(
        `SELECT c.*, d.name AS department_name, e.name AS resolution_owner_name
           FROM complaints c
           LEFT JOIN departments d ON d.id = c.department_id
           LEFT JOIN employees e ON e.user_id = c.resolution_owner_user_id
          WHERE c.id = $1`,
        [req.params.id]
      ),
      db.query(
        `SELECT * FROM complaint_updates WHERE complaint_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      ),
    ]);
    if (!hdr.rows[0]) return bad(res, 'NOT_FOUND', 'Complaint not found.', 404);
    res.json({
      success: true,
      data: { ...shape(hdr.rows[0]), updates: updates.rows.map(shapeUpdate) },
    });
  } catch (err) { next(err); }
}

// ─── POST /complaints/:id/assign — Travel Desk assigns owner ──
export async function assignComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isManager(req.user!.role)) return bad(res, 'FORBIDDEN', 'Travel Desk / Admin / Owner only.', 403);
    const userId = req.user!.sub;
    const ownerId = req.body?.resolutionOwnerUserId;
    if (!isUuid(ownerId)) return bad(res, 'OWNER_REQUIRED', 'resolutionOwnerUserId (UUID) is required.');

    const owner = await db.query(
      `SELECT id, role FROM users WHERE id = $1 AND is_active = true`, [ownerId]
    );
    if (!owner.rows[0]) return bad(res, 'OWNER_NOT_FOUND', 'Resolution owner not found / inactive.', 404);

    const out = await withTransaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM complaints WHERE id = $1 FOR UPDATE`, [req.params.id]
      );
      const row = r.rows[0];
      if (!row) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (row.status === 'CLOSED')
        throw Object.assign(new Error('CLOSED'), { status: 409, msg: 'Complaint is closed.' });

      const upd = await client.query(
        `UPDATE complaints
            SET resolution_owner_user_id = $1, assigned_by = $2, assigned_at = NOW(),
                status = CASE WHEN status = 'OPEN' THEN 'ASSIGNED' ELSE status END
          WHERE id = $3 RETURNING *`,
        [ownerId, userId, req.params.id]
      );
      const name = await callerName(userId);
      await client.query(
        `INSERT INTO complaint_updates (complaint_id, author_user_id, author_name, kind, body, from_status, to_status)
         VALUES ($1, $2, $3, 'ASSIGNMENT', $4, $5, $6)`,
        [req.params.id, userId, name,
         `Assigned to resolution owner.${req.body?.note ? ' ' + String(req.body.note).trim() : ''}`,
         row.status, upd.rows[0].status]
      );
      return upd.rows[0];
    });

    res.json({ success: true, data: shape(out), message: 'Resolution owner assigned.' });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 404) return bad(res, 'NOT_FOUND', 'Complaint not found.', 404);
    if (status === 409) return bad(res, 'WRONG_STATE', msg ?? 'Cannot assign.', 409);
    next(err);
  }
}

// ─── POST /complaints/:id/status — move IN_PROGRESS etc. ──────
// Resolution owner or a manager can advance the working state.
export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const target = req.body?.status as ComplaintStatus;
    if (![ComplaintStatus.IN_PROGRESS, ComplaintStatus.ASSIGNED].includes(target))
      return bad(res, 'BAD_STATUS', 'status must be ASSIGNED or IN_PROGRESS.');

    const out = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM complaints WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const row = r.rows[0];
      if (!row) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      const allowed = isManager(role) || row.resolution_owner_user_id === userId;
      if (!allowed) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      if (['RESOLVED', 'CLOSED'].includes(row.status))
        throw Object.assign(new Error('WRONG_STATE'), { status: 409, msg: `Already ${row.status}.` });

      const upd = await client.query(
        `UPDATE complaints SET status = $1 WHERE id = $2 RETURNING *`,
        [target, req.params.id]
      );
      const name = await callerName(userId);
      await client.query(
        `INSERT INTO complaint_updates (complaint_id, author_user_id, author_name, kind, body, from_status, to_status)
         VALUES ($1, $2, $3, 'STATUS_CHANGE', $4, $5, $6)`,
        [req.params.id, userId, name, `Status changed to ${target}.`, row.status, target]
      );
      return upd.rows[0];
    });
    res.json({ success: true, data: shape(out) });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 403) return bad(res, 'FORBIDDEN', 'Only the resolution owner or a manager can update status.', 403);
    if (status === 404) return bad(res, 'NOT_FOUND', 'Complaint not found.', 404);
    if (status === 409) return bad(res, 'WRONG_STATE', msg ?? 'Cannot update.', 409);
    next(err);
  }
}

// ─── POST /complaints/:id/resolve ─────────────────────────────
export async function resolveComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const note = String(req.body?.note ?? '').trim();
    if (note.length < 5) return bad(res, 'NOTE_REQUIRED', 'Resolution note (≥ 5 chars) is required.');

    const out = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM complaints WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const row = r.rows[0];
      if (!row) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      const allowed = isManager(role) || row.resolution_owner_user_id === userId;
      if (!allowed) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      if (['RESOLVED', 'CLOSED'].includes(row.status))
        throw Object.assign(new Error('WRONG_STATE'), { status: 409, msg: `Already ${row.status}.` });

      const upd = await client.query(
        `UPDATE complaints
            SET status = 'RESOLVED', resolution_note = $1, resolved_by = $2, resolved_at = NOW()
          WHERE id = $3 RETURNING *`,
        [note, userId, req.params.id]
      );
      const name = await callerName(userId);
      await client.query(
        `INSERT INTO complaint_updates (complaint_id, author_user_id, author_name, kind, body, from_status, to_status)
         VALUES ($1, $2, $3, 'STATUS_CHANGE', $4, $5, 'RESOLVED')`,
        [req.params.id, userId, name, `Resolved: ${note}`, row.status]
      );
      return upd.rows[0];
    });
    res.json({ success: true, data: shape(out), message: 'Complaint resolved.' });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 403) return bad(res, 'FORBIDDEN', 'Only the resolution owner or a manager can resolve.', 403);
    if (status === 404) return bad(res, 'NOT_FOUND', 'Complaint not found.', 404);
    if (status === 409) return bad(res, 'WRONG_STATE', msg ?? 'Cannot resolve.', 409);
    next(err);
  }
}

// ─── POST /complaints/:id/close ───────────────────────────────
// Raiser (satisfied) or a manager closes it out.
export async function closeComplaint(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const note = String(req.body?.note ?? '').trim();

    const out = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM complaints WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const row = r.rows[0];
      if (!row) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      const allowed = isManager(role) || row.raised_by_user_id === userId;
      if (!allowed) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
      if (row.status === 'CLOSED')
        throw Object.assign(new Error('WRONG_STATE'), { status: 409, msg: 'Already closed.' });

      const upd = await client.query(
        `UPDATE complaints SET status = 'CLOSED', closed_by = $1, closed_at = NOW() WHERE id = $2 RETURNING *`,
        [userId, req.params.id]
      );
      const name = await callerName(userId);
      await client.query(
        `INSERT INTO complaint_updates (complaint_id, author_user_id, author_name, kind, body, from_status, to_status)
         VALUES ($1, $2, $3, 'STATUS_CHANGE', $4, $5, 'CLOSED')`,
        [req.params.id, userId, name, note ? `Closed: ${note}` : 'Complaint closed.', row.status]
      );
      return upd.rows[0];
    });
    res.json({ success: true, data: shape(out), message: 'Complaint closed.' });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 403) return bad(res, 'FORBIDDEN', 'Only the raiser or a manager can close.', 403);
    if (status === 404) return bad(res, 'NOT_FOUND', 'Complaint not found.', 404);
    if (status === 409) return bad(res, 'WRONG_STATE', msg ?? 'Cannot close.', 409);
    next(err);
  }
}

// ─── POST /complaints/:id/comments ────────────────────────────
export async function addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    if (!await canSee(userId, req.user!.role, req.params.id))
      return bad(res, 'FORBIDDEN', 'Not allowed to comment on this complaint.', 403);
    const body = String(req.body?.body ?? '').trim();
    if (!body) return bad(res, 'BODY_REQUIRED', 'Comment body is required.');

    const name = await callerName(userId);
    const r = await db.query(
      `INSERT INTO complaint_updates (complaint_id, author_user_id, author_name, kind, body)
       VALUES ($1, $2, $3, 'COMMENT', $4) RETURNING *`,
      [req.params.id, userId, name, body]
    );
    res.status(201).json({ success: true, data: shapeUpdate(r.rows[0]) });
  } catch (err) { next(err); }
}

// ─── GET /complaints/analytics/vendors — F4 vendor-wise trend ─
export async function vendorAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isManager(req.user!.role)) return bad(res, 'FORBIDDEN', 'Not allowed.', 403);

    const byVendor = await db.query(
      `SELECT COALESCE(NULLIF(TRIM(vendor_name), ''), '(Unspecified)') AS vendor,
              COUNT(*)::INT AS total,
              COUNT(*) FILTER (WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS'))::INT AS open_count,
              COUNT(*) FILTER (WHERE status IN ('RESOLVED','CLOSED'))::INT AS resolved_count,
              COUNT(*) FILTER (WHERE priority = 'CRITICAL')::INT AS critical_count,
              COUNT(*) FILTER (WHERE priority = 'HIGH')::INT AS high_count
         FROM complaints
        GROUP BY vendor
        ORDER BY total DESC`
    );

    const byCategory = await db.query(
      `SELECT category, COUNT(*)::INT AS total
         FROM complaints GROUP BY category ORDER BY total DESC`
    );

    const byStatus = await db.query(
      `SELECT status, COUNT(*)::INT AS total FROM complaints GROUP BY status`
    );

    const byMonth = await db.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
              COUNT(*)::INT AS total
         FROM complaints
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month`
    );

    res.json({
      success: true,
      data: {
        byVendor:   byVendor.rows,
        byCategory: byCategory.rows,
        byStatus:   byStatus.rows,
        byMonth:    byMonth.rows,
      },
    });
  } catch (err) { next(err); }
}
