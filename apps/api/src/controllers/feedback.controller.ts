import { Request, Response, NextFunction } from 'express';
import db from '../config/db';
import { logger } from '../config/logger';
import { UserRole } from '@travel-os/shared-types';

// ─── Helpers ──────────────────────────────────────────────────
function bad(res: Response, code: string, message: string, status = 400): void {
  res.status(status).json({ success: false, error: { code, message } });
}

const FEEDBACK_WINDOW_DAYS = 30;

function ratingOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) return NaN as unknown as number; // signal invalid
  return n;
}

function shape(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id:                  row.id,
    travelRequestId:     row.travel_request_id,
    travelRequestCode:   row.travel_request_code ?? null,
    submittedByUserId:   row.submitted_by_user_id,
    employeeId:          row.employee_id,
    employeeName:        row.employee_name,
    departmentId:        row.department_id,
    departmentName:      row.department_name ?? null,
    overallRating:       row.overall_rating,
    bookingRating:       row.booking_rating,
    accommodationRating: row.accommodation_rating,
    transportRating:     row.transport_rating,
    travelDeskRating:    row.travel_desk_rating,
    wouldRecommend:      row.would_recommend,
    liked:               row.liked,
    improvements:        row.improvements,
    comments:            row.comments,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };
}

function isWithinWindow(completedAt: string | Date | null): boolean {
  if (!completedAt) return false;
  const done = new Date(completedAt).getTime();
  const limit = done + FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() <= limit;
}

// ─── GET /feedback/by-request/:requestId ──────────────────────
// Returns the feedback for a trip (if any) plus window/eligibility flags.
export async function getByRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tr = await db.query(
      `SELECT id, request_code, status, completed_at, submitted_by_user_id, traveler_employee_id
         FROM travel_requests WHERE id = $1`,
      [req.params.requestId]
    );
    const trip = tr.rows[0];
    if (!trip) return bad(res, 'NOT_FOUND', 'Travel request not found.', 404);

    const fb = await db.query(
      `SELECT f.*, d.name AS department_name, tr.request_code AS travel_request_code
         FROM feedback f
         LEFT JOIN departments d ON d.id = f.department_id
         LEFT JOIN travel_requests tr ON tr.id = f.travel_request_id
        WHERE f.travel_request_id = $1`,
      [req.params.requestId]
    );

    const isClaimant = trip.submitted_by_user_id === req.user!.sub;
    const windowOpen = trip.status === 'COMPLETED' && isWithinWindow(trip.completed_at);

    res.json({
      success: true,
      data: {
        feedback:    shape(fb.rows[0]),
        completedAt: trip.completed_at,
        isCompleted: trip.status === 'COMPLETED',
        windowOpen,                       // form is editable
        canSubmit:   windowOpen && isClaimant && !fb.rows[0],
        windowDays:  FEEDBACK_WINDOW_DAYS,
      },
    });
  } catch (err) { next(err); }
}

// ─── POST /feedback ───────────────────────────────────────────
// Body: { travelRequestId, overallRating, ...aspect ratings, wouldRecommend, liked, improvements, comments }
export async function createFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const b = req.body ?? {};

    const tr = await db.query(
      `SELECT id, request_code, status, completed_at, submitted_by_user_id,
              traveler_employee_id, traveler_full_name, traveler_department_id
         FROM travel_requests WHERE id = $1`,
      [b.travelRequestId]
    );
    const trip = tr.rows[0];
    if (!trip) return bad(res, 'TR_NOT_FOUND', 'Travel request not found.', 404);
    if (trip.status !== 'COMPLETED')
      return bad(res, 'NOT_COMPLETED', 'Feedback can only be given once the trip is marked completed.', 409);
    if (trip.submitted_by_user_id !== userId)
      return bad(res, 'FORBIDDEN', 'Only the traveler who raised the request can give feedback.', 403);
    if (!isWithinWindow(trip.completed_at))
      return bad(res, 'WINDOW_CLOSED', `The ${FEEDBACK_WINDOW_DAYS}-day feedback window has closed.`, 409);

    const overall = ratingOrNull(b.overallRating);
    if (overall === null || Number.isNaN(overall))
      return bad(res, 'RATING_REQUIRED', 'overallRating (1–5) is required.');

    const aspects = {
      booking:       ratingOrNull(b.bookingRating),
      accommodation: ratingOrNull(b.accommodationRating),
      transport:     ratingOrNull(b.transportRating),
      travelDesk:    ratingOrNull(b.travelDeskRating),
    };
    for (const [k, v] of Object.entries(aspects)) {
      if (Number.isNaN(v)) return bad(res, 'RATING_INVALID', `${k} rating must be 1–5.`);
    }

    const ins = await db.query(
      `INSERT INTO feedback (
          travel_request_id, submitted_by_user_id,
          employee_id, employee_name, department_id,
          overall_rating, booking_rating, accommodation_rating, transport_rating, travel_desk_rating,
          would_recommend, liked, improvements, comments
       ) VALUES (
          $1, $2,
          $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14
       ) RETURNING *`,
      [
        trip.id, userId,
        trip.traveler_employee_id ?? null, trip.traveler_full_name ?? null, trip.traveler_department_id ?? null,
        overall, aspects.booking, aspects.accommodation, aspects.transport, aspects.travelDesk,
        typeof b.wouldRecommend === 'boolean' ? b.wouldRecommend : null,
        b.liked ?? null, b.improvements ?? null, b.comments ?? null,
      ]
    );

    logger.info(`Feedback recorded for trip ${trip.request_code} by ${userId}`);
    res.status(201).json({ success: true, data: shape(ins.rows[0]) });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === '23505') return bad(res, 'DUPLICATE', 'Feedback already submitted for this trip.', 409);
    next(err);
  }
}

// ─── GET /feedback ────────────────────────────────────────────
// Org-wide feedback list for analytics (Admin / Owner / Travel Team).
export async function listFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    if (![UserRole.OWNER, UserRole.ADMIN, UserRole.TRAVEL_TEAM].includes(role))
      return bad(res, 'FORBIDDEN', 'Not allowed.', 403);

    const r = await db.query(
      `SELECT f.*, d.name AS department_name, tr.request_code AS travel_request_code
         FROM feedback f
         LEFT JOIN departments d ON d.id = f.department_id
         LEFT JOIN travel_requests tr ON tr.id = f.travel_request_id
        ORDER BY f.created_at DESC
        LIMIT 200`
    );

    const agg = await db.query(
      `SELECT
          COUNT(*)::INT                              AS total,
          ROUND(AVG(overall_rating)::numeric, 2)     AS avg_overall,
          ROUND(AVG(booking_rating)::numeric, 2)     AS avg_booking,
          ROUND(AVG(accommodation_rating)::numeric,2) AS avg_accommodation,
          ROUND(AVG(transport_rating)::numeric, 2)   AS avg_transport,
          ROUND(AVG(travel_desk_rating)::numeric, 2) AS avg_travel_desk,
          COUNT(*) FILTER (WHERE would_recommend)::INT AS recommend_count
         FROM feedback`
    );

    res.json({
      success: true,
      data: r.rows.map(shape),
      meta: { summary: agg.rows[0] },
    });
  } catch (err) { next(err); }
}
