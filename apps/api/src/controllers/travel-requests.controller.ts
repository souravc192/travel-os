import { Request, Response, NextFunction } from 'express';
import db, { withTransaction, buildPaginationClause } from '../config/db';
import { logger } from '../config/logger';
import {
  UserRole, RequestFor, RequestKind, ReservationKind, UrgencyLevel,
  TravelRequestStatus, REASON_OF_TRAVEL_OPTIONS, computeUrgency,
  SegmentTravelMode, HotelRequirement,
} from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function bad(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Build the approval chain per Phase 5A spec.
 *
 *   Normal    → L1 → L2  → L3
 *   Urgent    → L1 → HOD → L3
 *   Emergency → L1 → CXO → L3
 *
 * Rules:
 *   - Blank email at any slot → that slot is dropped.
 *   - If submitter's email matches an approver email → that slot is dropped
 *     (self-approval prevention).
 *   - If employee.no_of_approvers = 0 → chain is empty (caller should auto-approve).
 *
 * Returns the ordered list of approver emails to wire into
 * travel_request_approvals. Caller assigns levels 1..N in order.
 */
function buildChain(opts: {
  urgency:        UrgencyLevel;
  noOfApprovers:  number;
  submitterEmail: string;
  l1: string | null;
  l2: string | null;
  l3: string | null;
  hod: string | null;
  cxo: string | null;
}): string[] {
  if (opts.noOfApprovers <= 0) return [];

  const middle =
    opts.urgency === UrgencyLevel.URGENT    ? opts.hod :
    opts.urgency === UrgencyLevel.EMERGENCY ? opts.cxo :
                                              opts.l2;

  const raw = [opts.l1, middle, opts.l3];
  const submitter = (opts.submitterEmail ?? '').trim().toLowerCase();

  return raw
    .map((e) => (e ?? '').trim().toLowerCase())
    .filter((e) => e.length > 0)             // drop blanks
    .filter((e) => e !== submitter);         // drop self
}

// ─── POST /travel-requests ────────────────────────────────────
export async function createRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const body = req.body ?? {};

    // 1. Header / required fields
    const onBehalf = Boolean(body.submittedOnBehalf);

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
    // Multi-segment payload
    const travelSegmentsRaw = Array.isArray(body.travelSegments) ? body.travelSegments : [];
    const accommodationSegmentsRaw = Array.isArray(body.accommodationSegments)
      ? body.accommodationSegments : [];

    if (travelSegmentsRaw.length === 0) {
      return bad(res, 'NO_SEGMENTS', 'At least one travel segment is required.');
    }

    // Normalise + validate travel segments
    type CleanedSeg = {
      seq: number; from: string; to: string; date: string;
      mode: SegmentTravelMode; preferredTime: string | null; notes: string | null;
    };
    const travelSegments: CleanedSeg[] = [];
    for (let i = 0; i < travelSegmentsRaw.length; i++) {
      const s = travelSegmentsRaw[i];
      const from = String(s?.fromLocation ?? '').trim();
      const to   = String(s?.toLocation ?? '').trim();
      const date = String(s?.travelDate ?? '').trim();
      const mode = s?.travelMode;
      if (!from || !to) return bad(res, 'SEGMENT_BAD',  `Segment ${i + 1}: from and to are required.`);
      if (from.toLowerCase() === to.toLowerCase())
        return bad(res, 'SEGMENT_BAD', `Segment ${i + 1}: from and to must differ.`);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return bad(res, 'SEGMENT_BAD', `Segment ${i + 1}: travelDate must be YYYY-MM-DD.`);
      if (!Object.values(SegmentTravelMode).includes(mode))
        return bad(res, 'SEGMENT_BAD', `Segment ${i + 1}: travelMode is invalid.`);
      travelSegments.push({
        seq: i + 1, from, to, date, mode,
        preferredTime: s?.preferredTime ? String(s.preferredTime).trim() : null,
        notes:         s?.notes         ? String(s.notes).trim()         : null,
      });
    }
    // Travel dates must be monotonically non-decreasing
    for (let i = 1; i < travelSegments.length; i++) {
      if (travelSegments[i].date < travelSegments[i - 1].date) {
        return bad(res, 'SEGMENTS_OUT_OF_ORDER',
          `Travel segment ${i + 1} has an earlier date than segment ${i}.`);
      }
    }

    // Normalise + validate accommodation segments (optional)
    type CleanedAcc = {
      seq: number; city: string; center: string | null;
      checkIn: string; checkOut: string;
      requirement: HotelRequirement; requirementOther: string | null; notes: string | null;
    };
    const accommodationSegments: CleanedAcc[] = [];
    for (let i = 0; i < accommodationSegmentsRaw.length; i++) {
      const s = accommodationSegmentsRaw[i];
      const city = String(s?.city ?? '').trim();
      const ci   = String(s?.checkInDate ?? '').trim();
      const co   = String(s?.checkOutDate ?? '').trim();
      const req  = s?.hotelRequirement;
      if (!city) return bad(res, 'ACCOM_BAD', `Accommodation ${i + 1}: city is required.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ci) || !/^\d{4}-\d{2}-\d{2}$/.test(co))
        return bad(res, 'ACCOM_BAD', `Accommodation ${i + 1}: check-in / check-out must be YYYY-MM-DD.`);
      if (co <= ci)
        return bad(res, 'ACCOM_BAD', `Accommodation ${i + 1}: check-out must be after check-in.`);
      if (!Object.values(HotelRequirement).includes(req))
        return bad(res, 'ACCOM_BAD', `Accommodation ${i + 1}: hotelRequirement is invalid.`);
      const other = req === HotelRequirement.OTHER
        ? String(s?.hotelRequirementOther ?? '').trim() : null;
      if (req === HotelRequirement.OTHER && (!other || other.length < 2))
        return bad(res, 'ACCOM_BAD', `Accommodation ${i + 1}: specify the hotel requirement when choosing Other.`);
      accommodationSegments.push({
        seq: i + 1, city,
        center: s?.center ? String(s.center).trim() : null,
        checkIn: ci, checkOut: co,
        requirement: req, requirementOther: other,
        notes: s?.notes ? String(s.notes).trim() : null,
      });
    }

    const requestKind = body.requestKind && Object.values(RequestKind).includes(body.requestKind)
      ? body.requestKind : RequestKind.NEW_REQUEST;
    const reservation = body.reservationType && Object.values(ReservationKind).includes(body.reservationType)
      ? body.reservationType : ReservationKind.TRAVEL;
    const needsStay = accommodationSegments.length > 0;

    // 2. Resolve traveler from Members Master (+ department name for Expansion check)
    const empRes = await db.query(
      `SELECT e.id, e.name, e.email, e.designation, e.department_id, e.no_of_approvers,
              e.l1_email, e.l2_email, e.l3_email, e.hod_email, e.cxo_email,
              d.name AS department_name
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
        WHERE UPPER(e.employee_code) = UPPER($1) AND e.is_active = true`,
      [body.employeeCode]
    );
    const emp = empRes.rows[0];
    if (!emp) {
      return bad(res, 'EMPLOYEE_NOT_FOUND', 'No active employee with that code.', 404);
    }

    // 3. Expansion department → Center ID required
    const isExpansion = (emp.department_name ?? '').trim() === 'Expansion';
    const expansionCenterId = isExpansion ? String(body.expansionCenterId ?? '').trim() : null;
    if (isExpansion && !expansionCenterId) {
      return bad(res, 'CENTER_ID_REQUIRED', 'Center ID is required for Expansion department travel.');
    }

    // 4. Auto-compute urgency from the EARLIEST travel-segment date vs today.
    const earliestTravelDate = travelSegments
      .map((s) => s.date)
      .sort()[0];
    const submittedAt = new Date();
    const urgency     = computeUrgency(submittedAt, new Date(earliestTravelDate));

    // 5. Submitter email — used for self-approval skip
    const submitterRes = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
    const submitterEmail = submitterRes.rows[0]?.email ?? '';

    // 6. Extension prerequisites
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

    // 7. Build chain per urgency + skip blank/self emails
    const noOfApprovers = Math.max(0, Math.min(3, parseInt(emp.no_of_approvers ?? '0', 10)));
    const chainEmails   = buildChain({
      urgency, noOfApprovers,
      submitterEmail,
      l1: emp.l1_email, l2: emp.l2_email, l3: emp.l3_email,
      hod: emp.hod_email, cxo: emp.cxo_email,
    });

    // 8. Determine status + current_level from final chain
    let status: TravelRequestStatus;
    let currentLevel: number;
    if (chainEmails.length === 0) {
      status       = TravelRequestStatus.AUTO_APPROVED;
      currentLevel = 0;
    } else {
      status       = TravelRequestStatus.PENDING_L1;
      currentLevel = 1;
    }

    // 9. Insert request + segments + chain (transactional)
    const purpose = body.purpose ? String(body.purpose).trim() : null;
    const remarks = body.remarks ? String(body.remarks).trim() : null;

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
            status, current_level, decided_at, expansion_center_id,
            purpose, remarks, earliest_travel_date
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,
            $9,$10,$11,$12,
            $13,$14,$15,$16,
            $17,$18,$19,$20,
            $21,$22,
            $23,$24,$25,$26,$27,
            $28,$29,$30,$31,
            $32,$33,$34
         ) RETURNING *`,
        [
          userId, onBehalf, emp.id, body.employeeCode,
          onBehalf ? (body.onBehalfCostCentre ?? null) : null,
          urgency, body.reasonOfTravel, body.reasonOfTravel === 'Others' ? body.reasonOfTravelOther : null,
          emp.name, emp.email, emp.designation, emp.department_id,
          emp.l1_email, emp.l2_email, emp.l3_email, noOfApprovers,
          body.requestFor, requestKind, reservation, needsStay,
          extensionStartDate, initialRequestId,
          body.studentDetails ?? null, body.guestDetails ?? null,
          body.newMemberDetails ?? null, body.eventDetails ?? null, body.travelerDetails ?? null,
          status, currentLevel, status === TravelRequestStatus.AUTO_APPROVED ? new Date() : null,
          expansionCenterId,
          purpose, remarks, earliestTravelDate,
        ]
      );
      const tr = inserted.rows[0];

      // Travel segments
      for (const s of travelSegments) {
        await client.query(
          `INSERT INTO travel_segments
             (travel_request_id, sequence_no, from_location, to_location,
              travel_date, preferred_time, travel_mode, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tr.id, s.seq, s.from, s.to, s.date, s.preferredTime, s.mode, s.notes]
        );
      }

      // Accommodation segments
      for (const a of accommodationSegments) {
        await client.query(
          `INSERT INTO accommodation_segments
             (travel_request_id, sequence_no, city, center, check_in_date, check_out_date,
              hotel_requirement, hotel_requirement_other, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tr.id, a.seq, a.city, a.center, a.checkIn, a.checkOut,
           a.requirement, a.requirementOther, a.notes]
        );
      }

      // Approval chain
      for (let i = 0; i < chainEmails.length; i++) {
        await client.query(
          `INSERT INTO travel_request_approvals
             (travel_request_id, level, approver_email, status)
           VALUES ($1, $2, $3, 'PENDING')`,
          [tr.id, i + 1, chainEmails[i]]
        );
      }
      return tr;
    });

    logger.info(
      `Travel request ${out.request_code} created by ${userId} ` +
      `(urgency=${urgency}, status=${status}, chain=[${chainEmails.join(' → ')}])`
    );
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
                 OR EXISTS (
                     SELECT 1 FROM travel_segments ts
                      WHERE ts.travel_request_id = tr.id
                        AND (ts.to_location ILIKE $${params.length} OR ts.from_location ILIKE $${params.length})
                   ))`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, offset);

    const result = await db.query(
      `SELECT tr.id, tr.request_code, tr.status, tr.urgency, tr.current_level,
              tr.request_for, tr.request_kind, tr.reservation_type, tr.needs_stay,
              tr.reason_of_travel, tr.traveler_full_name, tr.traveler_email,
              tr.earliest_travel_date,
              tr.submitted_at, tr.decided_at, tr.created_at,
              d.name AS department_name,
              -- First-segment summary (for at-a-glance list display)
              (SELECT ts.from_location FROM travel_segments ts
                WHERE ts.travel_request_id = tr.id ORDER BY ts.sequence_no LIMIT 1) AS first_from,
              (SELECT ts.to_location   FROM travel_segments ts
                WHERE ts.travel_request_id = tr.id ORDER BY ts.sequence_no DESC LIMIT 1) AS last_to,
              (SELECT COUNT(*) FROM travel_segments ts WHERE ts.travel_request_id = tr.id)::INT AS segments_count
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
             tr.earliest_travel_date, tr.submitted_at,
             d.name AS department_name,
             a.level AS my_level, a.approver_email AS my_email,
             (SELECT ts.from_location FROM travel_segments ts
               WHERE ts.travel_request_id = tr.id ORDER BY ts.sequence_no LIMIT 1) AS first_from,
             (SELECT ts.to_location   FROM travel_segments ts
               WHERE ts.travel_request_id = tr.id ORDER BY ts.sequence_no DESC LIMIT 1) AS last_to
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
    const [approvals, segments, accommodations] = await Promise.all([
      db.query(
        `SELECT id, level, approver_email, status, acted_at, note
           FROM travel_request_approvals
          WHERE travel_request_id = $1
          ORDER BY level ASC`,
        [req.params.id]
      ),
      db.query(
        `SELECT id, sequence_no, from_location, to_location, travel_date,
                preferred_time, travel_mode, notes
           FROM travel_segments
          WHERE travel_request_id = $1
          ORDER BY sequence_no ASC`,
        [req.params.id]
      ),
      db.query(
        `SELECT id, sequence_no, city, center, check_in_date, check_out_date,
                hotel_requirement, hotel_requirement_other, notes
           FROM accommodation_segments
          WHERE travel_request_id = $1
          ORDER BY sequence_no ASC`,
        [req.params.id]
      ),
    ]);
    res.json({
      success: true,
      data: {
        ...r.rows[0],
        approvals: approvals.rows,
        travel_segments: segments.rows,
        accommodation_segments: accommodations.rows,
      },
    });
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

      // Advance or finalise — use ACTUAL chain length (post Phase 5A filter)
      // rather than the raw traveler_no_of_approvers, because Phase 5A drops
      // blank slots and the submitter's own email from the chain.
      let newStatus: TravelRequestStatus;
      let newLevel: number = tr.current_level;
      if (action === 'REJECT') {
        newStatus = TravelRequestStatus.REJECTED;
      } else {
        const chainCount = await client.query(
          `SELECT COUNT(*)::INT AS n FROM travel_request_approvals WHERE travel_request_id = $1`,
          [tr.id]
        );
        const totalLevels = chainCount.rows[0]?.n ?? 0;
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
                  WHEN $4 IN ('APPROVED','REJECTED','AUTO_APPROVED') THEN NOW()
                  ELSE decided_at
                END
          WHERE id = $3 RETURNING *`,
        [newStatus, newLevel, tr.id, String(newStatus)]
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
