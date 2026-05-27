import { Request, Response, NextFunction } from 'express';
import db, { withTransaction } from '../config/db';
import { cacheDel, RedisKey } from '../config/redis';
import { storage } from '../config/storage';
import { logger } from '../config/logger';
import {
  BookingType, BookingStatus, UserRole,
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

function currentFiscalYear(d: Date = new Date()): string {
  const y = d.getFullYear(), m = d.getMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function shape(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:                      row.id,
    travelRequestId:         row.travel_request_id,
    requestCode:             row.request_code,
    bookingType:             row.booking_type,
    bookingStatus:           row.booking_status,
    vendorName:              row.vendor_name,
    amount:                  asNumber(row.amount),
    currency:                row.currency,
    bookingReference:        row.booking_reference,
    bookingDate:             row.booking_date,
    departureAt:             row.departure_at,
    returnAt:                row.return_at,
    checkInDate:             row.check_in_date,
    checkOutDate:            row.check_out_date,
    invoicePath:             row.invoice_path,
    invoiceOriginalFilename: row.invoice_original_filename,
    invoiceUploadedAt:       row.invoice_uploaded_at,
    notes:                   row.notes,
    cancellationFee:         asNumber(row.cancellation_fee),
    cancelledAt:             row.cancelled_at,
    cancellationReason:      row.cancellation_reason,
    consumedAmount:          asNumber(row.consumed_amount),
    confirmedAt:             row.confirmed_at,
    createdAt:               row.created_at,
    updatedAt:               row.updated_at,
  };
}

// Authorisation rules:
//   Travel Team / Admin / Owner  → write
//   HOD / User                   → read-only on requests they can see
function canWrite(role: UserRole): boolean {
  return role === UserRole.TRAVEL_TEAM ||
         role === UserRole.ADMIN ||
         role === UserRole.OWNER;
}

// Can the current user see this travel request?
//   - submitter
//   - chain approver (HOD)
//   - Travel Team / Admin / Owner (everywhere)
async function userCanSeeRequest(
  userId: string, userEmail: string, role: UserRole, requestId: string
): Promise<boolean> {
  if (role === UserRole.TRAVEL_TEAM || role === UserRole.ADMIN || role === UserRole.OWNER) return true;
  const r = await db.query(
    `SELECT 1 FROM travel_requests tr
       WHERE tr.id = $1
         AND ( tr.submitted_by_user_id = $2
            OR EXISTS (
                 SELECT 1 FROM travel_request_approvals a
                  WHERE a.travel_request_id = tr.id
                    AND LOWER(a.approver_email) = LOWER($3)
               )
         )`,
    [requestId, userId, userEmail]
  );
  return Boolean(r.rows[0]);
}

// ─── POST /bookings  (Travel Team) ────────────────────────────
export async function createBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    if (!canWrite(role)) return bad(res, 'FORBIDDEN', 'Only Travel Team / Admin / Owner can create bookings.', 403);

    const b = req.body ?? {};
    if (!b.travelRequestId) return bad(res, 'REQUEST_REQUIRED', 'travelRequestId is required.');
    if (!Object.values(BookingType).includes(b.bookingType))
      return bad(res, 'INVALID_TYPE', `bookingType must be one of ${Object.values(BookingType).join(', ')}.`);
    if (!b.vendorName) return bad(res, 'VENDOR_REQUIRED', 'vendorName is required.');
    const amount = asNumber(b.amount);
    if (amount <= 0) return bad(res, 'INVALID_AMOUNT', 'amount must be > 0.');
    if (!b.bookingDate) return bad(res, 'BOOKING_DATE_REQUIRED', 'bookingDate is required.');

    // Only APPROVED / AUTO_APPROVED requests can be booked
    const reqRow = await db.query(
      `SELECT id, status, traveler_department_id FROM travel_requests WHERE id = $1`,
      [b.travelRequestId]
    );
    const tr = reqRow.rows[0];
    if (!tr) return bad(res, 'NOT_FOUND', 'Travel request not found.', 404);
    if (!['APPROVED', 'AUTO_APPROVED'].includes(tr.status)) {
      return bad(res, 'NOT_BOOKABLE', `Cannot book on a request in status ${tr.status}.`, 409);
    }
    if (!tr.traveler_department_id) {
      return bad(res, 'NO_DEPT', 'Travel request has no department — cannot link to budget.', 409);
    }

    // Snapshot the relevant department budget for this FY
    const fy = currentFiscalYear();
    const budRes = await db.query(
      `SELECT id FROM department_budgets WHERE department_id = $1 AND fiscal_year = $2`,
      [tr.traveler_department_id, fy]
    );
    const departmentBudgetId = budRes.rows[0]?.id ?? null;

    const result = await db.query(
      `INSERT INTO bookings (
         travel_request_id, booking_type, booking_status, vendor_name, amount, currency,
         booking_reference, booking_date, departure_at, return_at,
         check_in_date, check_out_date, notes,
         department_budget_id, created_by
       ) VALUES (
         $1, $2, 'PENDING', $3, $4, COALESCE($5, 'INR'),
         $6, $7, $8, $9,
         $10, $11, $12,
         $13, $14
       ) RETURNING *`,
      [
        b.travelRequestId, b.bookingType, b.vendorName, amount, b.currency,
        b.bookingReference ?? null, b.bookingDate, b.departureAt ?? null, b.returnAt ?? null,
        b.checkInDate ?? null, b.checkOutDate ?? null, b.notes ?? null,
        departmentBudgetId, userId,
      ]
    );
    res.status(201).json({ success: true, data: shape(result.rows[0]) });
  } catch (err) { next(err); }
}

// ─── PATCH /bookings/:id  (edit while still PENDING) ──────────
export async function updateBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canWrite(req.user!.role)) return bad(res, 'FORBIDDEN', 'Insufficient permissions.', 403);

    const cur = await db.query(`SELECT booking_status FROM bookings WHERE id = $1`, [req.params.id]);
    const row = cur.rows[0];
    if (!row) return bad(res, 'NOT_FOUND', 'Booking not found.', 404);
    if (row.booking_status !== 'PENDING') {
      return bad(res, 'NOT_EDITABLE', `Booking is ${row.booking_status} and cannot be edited.`, 409);
    }

    const b = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];
    function add(col: string, val: unknown) {
      if (val !== undefined) { params.push(val); updates.push(`${col} = $${params.length}`); }
    }
    add('booking_type',       b.bookingType);
    add('vendor_name',        b.vendorName);
    add('amount',             b.amount !== undefined ? asNumber(b.amount) : undefined);
    add('currency',           b.currency);
    add('booking_reference',  b.bookingReference);
    add('booking_date',       b.bookingDate);
    add('departure_at',       b.departureAt);
    add('return_at',          b.returnAt);
    add('check_in_date',      b.checkInDate);
    add('check_out_date',     b.checkOutDate);
    add('notes',              b.notes);

    if (updates.length === 0) return bad(res, 'NO_UPDATES', 'No editable fields provided.');
    params.push(req.params.id);
    const out = await db.query(
      `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ success: true, data: shape(out.rows[0]) });
  } catch (err) { next(err); }
}

// ─── POST /bookings/:id/confirm — debits department budget ────
export async function confirmBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    if (!canWrite(req.user!.role)) return bad(res, 'FORBIDDEN', 'Insufficient permissions.', 403);

    const out = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const bk = r.rows[0];
      if (!bk) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (bk.booking_status === 'CONFIRMED') {
        throw Object.assign(new Error('ALREADY_CONFIRMED'), { status: 409 });
      }
      if (bk.booking_status !== 'PENDING' && bk.booking_status !== 'RESCHEDULED') {
        throw Object.assign(new Error('BAD_STATE'), { status: 409, msg: `Cannot confirm a ${bk.booking_status} booking.` });
      }
      if (!bk.department_budget_id) {
        throw Object.assign(new Error('NO_BUDGET'), { status: 409, msg: 'No department budget linked.' });
      }

      // Re-fetch budget under lock to avoid overspend
      const bRes = await client.query(
        `SELECT * FROM department_budgets WHERE id = $1 FOR UPDATE`,
        [bk.department_budget_id]
      );
      const bud = bRes.rows[0];
      if (!bud) throw Object.assign(new Error('NO_BUDGET'), { status: 409 });

      const pool = asNumber(bud.allocated_annual) + asNumber(bud.supplementary_approved);
      const newSpend = asNumber(bud.consumed) + asNumber(bk.amount);
      if (newSpend > pool) {
        throw Object.assign(new Error('BUDGET_EXCEEDED'), { status: 409,
          msg: `Confirming this booking would exceed the department budget.` });
      }

      // Update booking
      const updBk = await client.query(
        `UPDATE bookings
            SET booking_status = 'CONFIRMED',
                confirmed_at = NOW(),
                confirmed_by = $1,
                consumed_amount = amount
          WHERE id = $2 RETURNING *`,
        [userId, bk.id]
      );

      // Debit budget
      const updBud = await client.query(
        `UPDATE department_budgets
            SET consumed = consumed + $1, last_updated_by = $2
          WHERE id = $3 RETURNING *`,
        [bk.amount, userId, bud.id]
      );

      // History row (CONSUME) — links both travel_request_id and booking_id
      await client.query(
        `INSERT INTO department_budget_history
           (department_budget_id, action, amount, balance_after, actor_id,
            travel_request_id, booking_id, note)
         VALUES ($1,'CONSUME',$2,$3,$4,$5,$6,$7)`,
        [
          bud.id, bk.amount,
          asNumber(updBud.rows[0].allocated_annual)
            + asNumber(updBud.rows[0].supplementary_approved)
            - asNumber(updBud.rows[0].consumed),
          userId, bk.travel_request_id, bk.id,
          `Booking confirmed: ${bk.vendor_name} (${bk.booking_type})`,
        ]
      );
      return { booking: updBk.rows[0], budget: updBud.rows[0] };
    });

    await cacheDel(RedisKey.budgetSummary(out.budget.department_id));
    logger.info(`Booking ${out.booking.id} confirmed → debited ₹${out.booking.amount} from budget ${out.budget.id}`);
    res.json({ success: true, data: shape(out.booking) });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 404) return bad(res, 'NOT_FOUND', 'Booking not found.', 404);
    if (status === 409) return bad(res, 'CONFLICT', msg ?? 'Cannot confirm booking.', 409);
    next(err);
  }
}

// ─── POST /bookings/:id/cancel — refund minus cancellation fee ────
export async function cancelBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    if (!canWrite(req.user!.role)) return bad(res, 'FORBIDDEN', 'Insufficient permissions.', 403);

    const cancellationFee = req.body?.cancellationFee !== undefined ? asNumber(req.body.cancellationFee) : 0;
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 5) return bad(res, 'REASON_REQUIRED', 'Cancellation reason (≥ 5 chars) required.');
    if (cancellationFee < 0) return bad(res, 'INVALID_FEE', 'cancellationFee cannot be negative.');

    const out = await withTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [req.params.id]);
      const bk = r.rows[0];
      if (!bk) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (bk.booking_status === 'CANCELLED') {
        throw Object.assign(new Error('ALREADY_CANCELLED'), { status: 409 });
      }
      if (cancellationFee > asNumber(bk.amount)) {
        throw Object.assign(new Error('FEE_TOO_HIGH'), { status: 400,
          msg: 'Cancellation fee cannot exceed the booking amount.' });
      }

      const refund = bk.booking_status === 'CONFIRMED'
        ? Math.max(0, asNumber(bk.amount) - cancellationFee)
        : 0;
      const newConsumed = bk.booking_status === 'CONFIRMED' ? cancellationFee : 0;

      // Update booking
      const updBk = await client.query(
        `UPDATE bookings
            SET booking_status = 'CANCELLED',
                cancelled_at = NOW(),
                cancelled_by = $1,
                cancellation_reason = $2,
                cancellation_fee = $3,
                consumed_amount = $4
          WHERE id = $5 RETURNING *`,
        [userId, reason, cancellationFee, newConsumed, bk.id]
      );

      // Refund flow (only if previously CONFIRMED)
      if (refund > 0 && bk.department_budget_id) {
        const updBud = await client.query(
          `UPDATE department_budgets
              SET consumed = GREATEST(0, consumed - $1), last_updated_by = $2
            WHERE id = $3 RETURNING *`,
          [refund, userId, bk.department_budget_id]
        );
        await client.query(
          `INSERT INTO department_budget_history
             (department_budget_id, action, amount, balance_after, actor_id,
              travel_request_id, booking_id, note)
           VALUES ($1,'REFUND',$2,$3,$4,$5,$6,$7)`,
          [
            bk.department_budget_id, refund,
            asNumber(updBud.rows[0].allocated_annual)
              + asNumber(updBud.rows[0].supplementary_approved)
              - asNumber(updBud.rows[0].consumed),
            userId, bk.travel_request_id, bk.id,
            `Booking cancelled: ${bk.vendor_name} (fee ₹${cancellationFee})`,
          ]
        );
      }
      return { booking: updBk.rows[0], refund };
    });

    if (out.booking.department_budget_id) {
      const d = await db.query(
        `SELECT department_id FROM department_budgets WHERE id = $1`,
        [out.booking.department_budget_id]
      );
      if (d.rows[0]) await cacheDel(RedisKey.budgetSummary(d.rows[0].department_id));
    }
    logger.info(`Booking ${out.booking.id} cancelled (fee ₹${cancellationFee}, refund ₹${out.refund})`);
    res.json({ success: true, data: shape(out.booking) });
  } catch (err) {
    const status = (err as { status?: number }).status;
    const msg    = (err as { msg?: string }).msg;
    if (status === 400) return bad(res, 'BAD_INPUT', msg ?? 'Invalid input.');
    if (status === 404) return bad(res, 'NOT_FOUND', 'Booking not found.', 404);
    if (status === 409) return bad(res, 'CONFLICT', msg ?? 'Cannot cancel booking.', 409);
    next(err);
  }
}

// ─── POST /bookings/:id/reschedule ───────────────────────────
// Marks the booking as RESCHEDULED. Does NOT touch budget — the existing
// CONFIRMED debit (if any) stays. Caller should typically create a new
// PENDING booking for the new dates.
export async function rescheduleBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canWrite(req.user!.role)) return bad(res, 'FORBIDDEN', 'Insufficient permissions.', 403);
    const note = String(req.body?.note ?? '').trim();
    const out = await db.query(
      `UPDATE bookings
          SET booking_status = 'RESCHEDULED',
              notes = COALESCE(notes,'') || $1
        WHERE id = $2 AND booking_status IN ('PENDING','CONFIRMED')
        RETURNING *`,
      [note ? `\n[RESCHEDULED] ${note}` : '\n[RESCHEDULED]', req.params.id]
    );
    if (!out.rows[0]) return bad(res, 'CONFLICT', 'Booking not found or not reschedulable.', 409);
    res.json({ success: true, data: shape(out.rows[0]) });
  } catch (err) { next(err); }
}

// ─── POST /bookings/:id/invoice — multipart upload ───────────
export async function uploadInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!canWrite(req.user!.role)) return bad(res, 'FORBIDDEN', 'Insufficient permissions.', 403);
    if (!req.file) return bad(res, 'NO_FILE', 'Upload the invoice under field "file".');

    const ym = new Date().toISOString().slice(0, 7).replace('-', '/');
    const put = await storage.put(
      `invoices/${ym}`, req.file.originalname, req.file.buffer
    );

    const out = await db.query(
      `UPDATE bookings
          SET invoice_path = $1,
              invoice_original_filename = $2,
              invoice_uploaded_at = NOW()
        WHERE id = $3 RETURNING *`,
      [put.key, req.file.originalname, req.params.id]
    );
    if (!out.rows[0]) {
      // Clean up orphan file
      await storage.remove(put.key).catch(() => {});
      return bad(res, 'NOT_FOUND', 'Booking not found.', 404);
    }
    res.json({ success: true, data: shape(out.rows[0]), message: 'Invoice uploaded.' });
  } catch (err) { next(err); }
}

// ─── GET /bookings/:id/invoice — authenticated download ───────
export async function downloadInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT b.invoice_path, b.invoice_original_filename, b.travel_request_id
         FROM bookings b WHERE b.id = $1`,
      [req.params.id]
    );
    const bk = r.rows[0];
    if (!bk || !bk.invoice_path) return bad(res, 'NOT_FOUND', 'Invoice not found.', 404);

    if (!await userCanSeeRequest(
      req.user!.sub, req.user!.email, req.user!.role, bk.travel_request_id
    )) return bad(res, 'FORBIDDEN', 'Not allowed to download this invoice.', 403);

    const { stream, size } = await storage.read(bk.invoice_path);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', size.toString());
    res.setHeader('Content-Disposition',
      `inline; filename="${(bk.invoice_original_filename ?? 'invoice').replace(/"/g, '')}"`);
    stream.pipe(res);
  } catch (err) { next(err); }
}

// ─── GET /bookings  (list — Travel Team/Admin/Owner only) ─────
export async function listBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const userId = req.user!.sub;
    const userEmail = req.user!.email;
    const { status, requestCode, search } = req.query;

    const params: unknown[] = [];
    const where: string[] = [];

    if (role !== UserRole.TRAVEL_TEAM && role !== UserRole.ADMIN && role !== UserRole.OWNER) {
      // Restrict to requests the caller can see
      params.push(userId, userEmail);
      where.push(`(
        tr.submitted_by_user_id = $${params.length - 1}
        OR EXISTS (
          SELECT 1 FROM travel_request_approvals a
           WHERE a.travel_request_id = tr.id AND LOWER(a.approver_email) = LOWER($${params.length})
        )
      )`);
    }
    if (status) { params.push(status); where.push(`b.booking_status = $${params.length}`); }
    if (requestCode) { params.push(requestCode); where.push(`tr.request_code = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(b.vendor_name ILIKE $${params.length} OR b.booking_reference ILIKE $${params.length})`);
    }

    const result = await db.query(
      `SELECT b.*, tr.request_code, tr.traveler_full_name,
              tr.booking_destination AS request_destination,
              d.name AS department_name
         FROM bookings b
         JOIN travel_requests tr ON tr.id = b.travel_request_id
         LEFT JOIN departments d ON d.id = tr.traveler_department_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY b.created_at DESC
         LIMIT 200`,
      params
    );
    res.json({ success: true, data: result.rows.map(shape) });
  } catch (err) { next(err); }
}

// ─── GET /bookings/by-request/:requestId ─────────────────────
export async function listBookingsForRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requestId = req.params.requestId;
    if (!await userCanSeeRequest(req.user!.sub, req.user!.email, req.user!.role, requestId)) {
      return bad(res, 'FORBIDDEN', 'Not allowed to view this request.', 403);
    }
    const r = await db.query(
      `SELECT * FROM bookings WHERE travel_request_id = $1 ORDER BY created_at ASC`,
      [requestId]
    );
    res.json({ success: true, data: r.rows.map(shape) });
  } catch (err) { next(err); }
}

// ─── GET /bookings/:id ───────────────────────────────────────
export async function getBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT b.*, tr.request_code, tr.traveler_full_name
         FROM bookings b
         JOIN travel_requests tr ON tr.id = b.travel_request_id
        WHERE b.id = $1`,
      [req.params.id]
    );
    const bk = r.rows[0];
    if (!bk) return bad(res, 'NOT_FOUND', 'Booking not found.', 404);
    if (!await userCanSeeRequest(req.user!.sub, req.user!.email, req.user!.role, bk.travel_request_id)) {
      return bad(res, 'FORBIDDEN', 'Not allowed to view this booking.', 403);
    }
    res.json({ success: true, data: shape(bk) });
  } catch (err) { next(err); }
}
