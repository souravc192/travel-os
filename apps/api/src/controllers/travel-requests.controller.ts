import { Request, Response, NextFunction } from 'express';
import db, { withTransaction, buildPaginationClause } from '../config/db';
import { logger } from '../config/logger';
import {
  UserRole, RequestFor, RequestKind, ReservationKind, UrgencyLevel,
  TravelRequestStatus, REASON_OF_TRAVEL_OPTIONS,
} from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function bad(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ─── POST /travel-requests ────────────────────────────────────
export async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const body = req.body ?? {};

    // 1. Header / required fields
    const onBehalf = Boolean(body.submittedOnBehalf);
    const urgency  = body.urgency === 'URGENT' ? UrgencyLevel.URGENT : UrgencyLevel.NORMAL;

    if (!REASON_OF_TRAVEL_OPTIONS.includes(body.reasonOfTravel)) {
      return bad(res, 'INVALID_REASON', 'Reason of travel is not in the allowed list.');
    }
    if (body.reasonOfTravel === 'Others' && (!body.reasonOfTravelOther || String(body.reasonOfTravelOther).trim().length < 3)) {
      return bad(res, 'REASON_OTHER_REQUIRED', 'When choosing "Others", a free-text reason is required.');
    }
    if (!body.employeeCode) {
      return bad(res, 'EMPLOYEE_CODE_REQUIRED', 'Traveler employee code is required.');
    }
    if (!Object.values(RequestFor).includes(body.requestFor)) {
      return bad(res, 'INVALID_REQUEST_FOR', 'requestFor must be one of: ' + Object.values(RequestFor).join(', '));
    }
    const requestKind = body.requestKind && Object.values(RequestKind).includes(body.requestKind)
      ? body.requestKind : RequestKind.NEW_REQUEST;
    const reservation = body.reservationType && Object.values(ReservationKind).includes(body.reservationType)
      ? body.reservationType : ReservationKind.TRAVEL;
    const needsStay = Boolean(body.needsStay);

    // 2. Resolve traveler from Members Master
    const empRes = await db.query(
      `SELECT e.id, e.name, e.email, e.designation, e.department_id, e.no_of_approvers,
              e.l1_email, e.l2_email, e.l3_email
         FROM employees e
        WHERE UPPER(e.employee_code) = UPPER($1) AND e.is_active = true`,
      [body.employeeCode]
    );
    const emp = empRes.rows[0];
    if (!emp) {
      return bad(res, 'EMPLOYEE_NOT_FOUND', 'No active employee with that code.', 404);
    }

    // 3. Extension prerequisites
    let initialRequestId: string | null = null;
    let extensionStartDate: string | null = null;
    if (requestKind === RequestKind.EXTENSION) {
      if (!isUuid(body.initialRequestId)) {
        return bad(res, 'INITIAL_ID_REQUIRED', 'initialRequestId (UUID) is required for extensions.');
      }
      initialRequestId   = body.initialRequestId;
      extensionStartDate = body.extensionStartDate ?? null;
      const init = await db.query(`SELECT id FROM travel_requests WHERE id = $1`, [initialRequestId]);
      if (!init.rows[0]) return bad(res, 'INITIAL_NOT_FOUND', 'Linked initial request not found.', 404);
    }

    // 4. Determine status + current_level from chain length
    const chainLen = Math.max(0, Math.min(3, parseInt(emp.no_of_approvers ?? '0', 10)));
    let status: TravelRequestStatus;
    let currentLevel: number;
    if (chainLen === 0) {
      status       = TravelRequestStatus.AUTO_APPROVED;
      currentLevel = 0;
    } else {
      status       = (`PENDING_L${chainLen >= 1 ? 1 : 1}`) as TravelRequestStatus;
      status       = TravelRequestStatus.PENDING_L1;
      currentLevel = 1;
    }

    // 5. Insert request + chain (transactional)
    const out = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO travel_requests (
            submitted_by_user_id, submitted_on_behalf, traveler_employee_id, traveler_employee_code,
            on_behalf_cost_centre, urgency, reason_of_travel, reason_of_travel_other,
            traveler_full_name, traveler_email, traveler_designation, traveler_department_id,
            traveler_l1_email, traveler_l2_email, traveler_l3_email, traveler_no_of_approvers,
            request_for, request_kind, reservation_type, needs_stay,
            extension_start_date, initial_request_id,
            student_details, guest_details, new_member_details, event_details, traveler_details,
            booking_boarding, booking_visiting_reason, booking_destination, booking_departure_date,
            booking_preferred_time, booking_purpose, booking_remarks,
            stay_visiting_center, stay_location, stay_check_in, stay_check_out, stay_remarks,
            status, current_level, decided_at
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,
            $13,$14,$15,$16,
            $17,$18,$19,$20,
            $21,$22,
            $23,$24,$25,$26,$27,
            $28,$29,$30,$31,$32,$33,$34,
            $35,$36,$37,$38,$39,
            $40,$41,$42
         ) RETURNING *`,
        [
          userId, onBehalf, emp.id, body.employeeCode,
          onBehalf ? (body.onBehalfCostCentre ?? null) : null,
          urgency, body.reasonOfTravel, body.reasonOfTravel === 'Others' ? body.reasonOfTravelOther : null,
          emp.name, emp.email, emp.designation, emp.department_id,
          emp.l1_email, emp.l2_email, emp.l3_email, chainLen,
          body.requestFor, requestKind, reservation, needsStay,
          extensionStartDate, initialRequestId,
          body.studentDetails ?? null, body.guestDetails ?? null,
          body.newMemberDetails ?? null, body.eventDetails ?? null, body.travelerDetails ?? null,
          body.bookingBoarding ?? null, body.bookingVisitingReason ?? null,
          body.bookingDestination ?? null, body.bookingDepartureDate ?? null,
          body.bookingPreferredTime ?? null, body.bookingPurpose ?? null, body.bookingRemarks ?? null,
          needsStay ? (body.stayVisitingCenter ?? null) : null,
          needsStay ? (body.stayLocation ?? null) : null,
          needsStay ? (body.stayCheckIn ?? null) : null,
          needsStay ? (body.stayCheckOut ?? null) : null,
          needsStay ? (body.stayRemarks ?? null) : null,
          status, currentLevel, status === TravelRequestStatus.AUTO_APPROVED ? new Date() : null,
        ]
      );
      const tr = inserted.rows[0];

      const chainEmails = [emp.l1_email, emp.l2_email, emp.l3_email].slice(0, chainLen);
      for (let i = 0; i < chainEmails.length; i++) {
        const email = chainEmails[i];
        if (!email) continue;
        await client.query(
          `INSERT INTO travel_request_approvals
             (travel_request_id, level, approver_email, status)
           VALUES ($1, $2, $3, 'PENDING')`,
          [tr.id, i + 1, email.toLowerCase()]
        );
      }
      return tr;
    });

    logger.info(`Travel request ${out.request_code} created by ${userId} (status: ${status}, chain: ${chainLen})`);
    res.status(201).json({ success: true, data: out });
  } catch (err) { next(err); }
}

// ─── GET /travel-requests ─────────────────────────────────────
// Role scoping:
//   USER       — only own (submitted_by_user_id = me OR traveler.user_id = me)
//   HOD        — own + requests where any chain row's approver_email = my email
//   TRAVEL_TEAM/ADMIN/OWNER — all
export async function listRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const userId = req.user!.sub;
    const email  = req.user!.email.toLowerCase();
    const { page = 1, limit = 20, status, search } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where: string[] = [];
    const params: unknown[] = [];

    if (role === UserRole.USER) {
      params.push(userId);
      where.push(`(tr.submitted_by_user_id = $${params.length})`);
    } else if (role === UserRole.HOD) {
      params.push(userId, email);
      where.push(`(tr.submitted_by_user_id = $${params.length - 1}
                  OR EXISTS (
                    SELECT 1 FROM travel_request_approvals a
                     WHERE a.travel_request_id = tr.id AND LOWER(a.approver_email) = $${params.length}
                  ))`);
    }

    if (status) { params.push(status); where.push(`tr.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(tr.request_code ILIKE $${params.length}
                 OR tr.traveler_full_name ILIKE $${params.length}
                 OR tr.booking_destination ILIKE $${params.length})`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, offset);

    const result = await db.query(
      `SELECT tr.id, tr.request_code, tr.status, tr.urgency, tr.current_level,
              tr.request_for, tr.request_kind, tr.reservation_type, tr.needs_stay,
              tr.reason_of_travel, tr.traveler_full_name, tr.traveler_email,
              tr.booking_boarding, tr.booking_destination, tr.booking_departure_date,
              tr.submitted_at, tr.decided_at, tr.created_at,
              d.name AS department_name
         FROM travel_requests tr
         LEFT JOIN departments d ON d.id = tr.traveler_department_id
         ${whereSQL}
         ORDER BY tr.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM travel_requests tr ${whereSQL}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: result.rows,
      meta: { page: +page, limit: lim, total: +count.rows[0].count },
    });
  } catch (err) { next(err); }
}

// ─── GET /travel-requests/pending-approvals ───────────────────
export async function listPendingApprovals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const email = req.user!.email.toLowerCase();
    const params: unknown[] = [];
    let approverFilter = '';
    if (role === UserRole.HOD) {
      params.push(email);
      approverFilter = `AND LOWER(a.approver_email) = $${params.length}`;
    }
    // ADMIN / OWNER / TRAVEL_TEAM see everything pending
    const sql = `
      SELECT tr.id, tr.request_code, tr.status, tr.urgency, tr.current_level,
             tr.request_for, tr.reason_of_travel, tr.traveler_full_name,
             tr.booking_boarding, tr.booking_destination, tr.booking_departure_date,
             tr.submitted_at,
             d.name AS department_name,
             a.level AS my_level, a.approver_email AS my_email
        FROM travel_requests tr
        JOIN travel_request_approvals a ON a.travel_request_id = tr.id
        LEFT JOIN departments d ON d.id = tr.traveler_department_id
       WHERE a.status = 'PENDING'
         AND a.level = tr.current_level
         ${approverFilter}
         AND tr.status IN ('PENDING_L1','PENDING_L2','PENDING_L3')
       ORDER BY tr.submitted_at ASC
       LIMIT 100`;
    const result = await db.query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
}

// ─── GET /travel-requests/:id ─────────────────────────────────
export async function getRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = await db.query(
      `SELECT tr.*, d.name AS department_name
         FROM travel_requests tr
         LEFT JOIN departments d ON d.id = tr.traveler_department_id
        WHERE tr.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return bad(res, 'NOT_FOUND', 'Travel request not found.', 404);
    const approvals = await db.query(
      `SELECT id, level, approver_email, status, acted_at, note
         FROM travel_request_approvals
        WHERE travel_request_id = $1
        ORDER BY level ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...r.rows[0], approvals: approvals.rows } });
  } catch (err) { next(err); }
}

// ─── POST /travel-requests/:id/approve ────────────────────────
export async function approveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  await actOnRequest(req, res, next, 'APPROVE');
}

// ─── POST /travel-requests/:id/reject ─────────────────────────
export async function rejectRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  await actOnRequest(req, res, next, 'REJECT');
}

async function actOnRequest(
  req: Request, res: Response, next: NextFunction, action: 'APPROVE' | 'REJECT'
): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const email  = req.user!.email.toLowerCase();
    const note   = (req.body?.note ?? '').toString().trim();
    if (action === 'REJECT' && note.length < 5) {
      return bad(res, 'NOTE_REQUIRED', 'Rejection requires a note (≥ 5 chars).');
    }

    const out = await withTransaction(async (client) => {
      const trRes = await client.query(
        `SELECT * FROM travel_requests WHERE id = $1 FOR UPDATE`, [req.params.id]
      );
      const tr = trRes.rows[0];
      if (!tr) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
      if (![TravelRequestStatus.PENDING_L1, TravelRequestStatus.PENDING_L2, TravelRequestStatus.PENDING_L3]
            .includes(tr.status)) {
        throw Object.assign(new Error('NOT_PENDING'), { status: 409, msg: `Already ${tr.status}` });
      }

      const aRes = await client.query(
        `SELECT * FROM travel_request_approvals
          WHERE travel_request_id = $1 AND level = $2 AND status = 'PENDING'
          FOR UPDATE`,
        [tr.id, tr.current_level]
      );
      const approval = aRes.rows[0];
      if (!approval) throw Object.assign(new Error('NO_CHAIN_ROW'), { status: 409 });

      // Authorisation: caller is either Admin/Owner (override) or the named approver
      const isOverride = role === UserRole.OWNER || role === UserRole.ADMIN;
      if (!isOverride && approval.approver_email.toLowerCase() !== email) {
        throw Object.assign(new Error('NOT_YOUR_APPROVAL'), { status: 403 });
      }

      // Update this chain row
      await client.query(
        `UPDATE travel_request_approvals
            SET status = $1, acted_at = NOW(), note = $2, approver_user_id = $3
          WHERE id = $4`,
        [action === 'APPROVE' ? 'APPROVED' : 'REJECTED', note || null, userId, approval.id]
      );

      // Advance or finalise
      let newStatus: TravelRequestStatus;
      let newLevel: number = tr.current_level;
      if (action === 'REJECT') {
        newStatus = TravelRequestStatus.REJECTED;
      } else {
        const totalLevels = tr.traveler_no_of_approvers;
        if (tr.current_level >= totalLevels) {
          newStatus = TravelRequestStatus.APPROVED;
        } else {
          newLevel  = tr.current_level + 1;
          newStatus = (`PENDING_L${newLevel}`) as TravelRequestStatus;
        }
      }

      const upd = await client.query(
        `UPDATE travel_requests
            SET status = $1, current_level = $2,
                decided_at = CASE
                  WHEN $1 IN ('APPROVED','REJECTED','AUTO_APPROVED') THEN NOW()
                  ELSE decided_at
                END
          WHERE id = $3 RETURNING *`,
        [newStatus, newLevel, tr.id]
      );
      return upd.rows[0];
    });

    logger.info(`Travel request ${out.request_code}: ${action} by ${email} → ${out.status}`);
    res.json({ success: true, data: out, message: `Request ${action.toLowerCase()}d.` });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return bad(res, 'NOT_FOUND', 'Travel request not found.', 404);
    if (status === 409) return bad(res, 'CONFLICT', (err as { msg?: string }).msg ?? 'Cannot act on this request.', 409);
    if (status === 403) return bad(res, 'NOT_YOUR_APPROVAL', 'You are not the assigned approver for this level.', 403);
    next(err);
  }
}

// ─── POST /travel-requests/:id/cancel — submitter or Admin/Owner ──
export async function cancelRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const role   = req.user!.role;
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 5) return bad(res, 'REASON_REQUIRED', 'Cancel reason ≥ 5 chars.');

    const out = await db.query(
      `UPDATE travel_requests
          SET status = 'CANCELLED', decided_at = NOW()
        WHERE id = $1
          AND status IN ('PENDING_L1','PENDING_L2','PENDING_L3','AUTO_APPROVED','APPROVED')
          AND ($2 IN ('OWNER','ADMIN') OR submitted_by_user_id = $3)
        RETURNING *`,
      [req.params.id, role, userId]
    );
    if (!out.rows[0]) return bad(res, 'CANNOT_CANCEL', 'Either not found, already closed, or not yours.', 409);
    // Note stored on the latest pending approval row (best-effort)
    await db.query(
      `UPDATE travel_request_approvals SET note = COALESCE(note,'') || $1
        WHERE travel_request_id = $2 AND status = 'PENDING'`,
      [`\n[CANCELLED: ${reason}]`, out.rows[0].id]
    );
    res.json({ success: true, data: out.rows[0], message: 'Request cancelled.' });
  } catch (err) { next(err); }
}
