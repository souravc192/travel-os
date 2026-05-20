import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import db, { withTransaction, buildPaginationClause } from '../config/db';
import { TRAVEL_POLICIES, TravelMode, GradeLevel } from '@travel-os/shared-types';

const router = Router();

// ─── Trip Code Generator ──────────────────────────────────────
async function generateTripCode(departmentCode: string): Promise<string> {
  const year = new Date().getFullYear();
  const result = await db.query(
    `SELECT nextval('trip_code_seq') AS seq`
  );
  const seq = String(result.rows[0].seq).padStart(5, '0');
  return `TRP-${year}-${departmentCode.toUpperCase()}-${seq}`;
}

// GET /api/v1/trips/my
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.sub;
    const { page = 1, limit = 20, status } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const empResult = await db.query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    const empId = empResult.rows[0]?.id;
    if (!empId) { res.json({ success: true, data: [] }); return; }

    const params: unknown[] = [empId];
    let statusClause = '';
    if (status) { params.push(status); statusClause = `AND t.status = $${params.length}`; }

    params.push(lim, offset);
    const result = await db.query(
      `SELECT t.*, d.name AS department_name
       FROM trips t
       JOIN employees e ON e.id = t.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE t.employee_id = $1 ${statusClause}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/trips — Travel Desk / Admin view all
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, employeeId } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where: string[] = [];
    const params: unknown[] = [];

    if (status)     { params.push(status);     where.push(`t.status = $${params.length}`); }
    if (employeeId) { params.push(employeeId); where.push(`t.employee_id = $${params.length}`); }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, offset);

    const result = await db.query(
      `SELECT t.*, e.name AS employee_name, e.employee_code, e.grade_level,
              d.name AS department_name
       FROM trips t
       JOIN employees e ON e.id = t.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${whereSQL}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM trips t JOIN employees e ON e.id = t.employee_id ${whereSQL}`,
      params.slice(0, -2)
    );

    res.json({
      success: true, data: result.rows,
      meta: { page: +page, limit: lim, total: +count.rows[0].count },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/trips/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT t.*, e.name AS employee_name, e.grade_level, e.employee_code,
              u.email AS employee_email, d.name AS department_name,
              cc.code AS cost_centre_code,
              (SELECT json_agg(a ORDER BY a.level)
               FROM approvals a WHERE a.trip_id = t.id) AS approvals,
              (SELECT json_agg(b)
               FROM bookings b WHERE b.trip_id = t.id) AS bookings,
              (SELECT json_agg(ex)
               FROM exceptions ex WHERE ex.trip_id = t.id) AS exceptions
       FROM trips t
       JOIN employees e ON e.id = t.employee_id
       JOIN users u ON u.id = e.user_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN cost_centres cc ON cc.id = e.cost_centre_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found.' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/trips — Create trip
router.post('/',
  authenticate,
  [
    body('travelType').isIn(Object.values(TravelMode)).withMessage('Invalid travel mode.'),
    body('origin').notEmpty().withMessage('Origin is required.').trim(),
    body('destination').notEmpty().withMessage('Destination is required.').trim(),
    body('departureDate').isISO8601().withMessage('Invalid departure date.'),
    body('purposeOfTravel').notEmpty().withMessage('Purpose of travel is required.').trim(),
    body('budgetCap').isFloat({ min: 0 }).withMessage('Budget cap must be a positive number.'),
  ],
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.sub;
      const {
        travelType, origin, destination, departureDate, returnDate,
        isRoundTrip = false, purposeOfTravel, budgetCap,
        additionalTravelers = [], stayRequired = false,
        stayCheckIn, stayCheckOut, preferredHotelLocality,
      } = req.body;

      // Get employee record
      const empResult = await db.query(
        `SELECT e.*, d.code AS dept_code
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.user_id = $1`,
        [userId]
      );
      const employee = empResult.rows[0];
      if (!employee) {
        res.status(400).json({ success: false, error: { code: 'NO_EMPLOYEE', message: 'No employee record found.' } });
        return;
      }

      // ── Policy validation ─────────────────────────────────
      const policy = employee.grade_level
        ? TRAVEL_POLICIES[employee.grade_level as GradeLevel]
        : null;

      if (policy && !policy.allowedModes.includes(travelType)) {
        res.status(422).json({
          success: false,
          error: {
            code: 'POLICY_VIOLATION',
            message: `Grade ${employee.grade_level} is not permitted to travel by ${travelType}. Allowed: ${policy.allowedModes.join(', ')}.`,
          },
        });
        return;
      }

      // ── Advance booking days ──────────────────────────────
      const advanceBookingDays = Math.floor(
        (new Date(departureDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      const lateBooking = policy && advanceBookingDays < 3;

      // ── Budget check ──────────────────────────────────────
      const budgetResult = await db.query(
        `SELECT bm.*,
                (bm.allocated + bm.supplementary_approved - bm.consumed) AS remaining
         FROM budget_master bm
         WHERE bm.cost_centre_id = $1 AND bm.fiscal_year = '2024-25'`,
        [employee.cost_centre_id]
      );
      const budget = budgetResult.rows[0];
      if (budget && parseFloat(budget.remaining) <= 0) {
        res.status(422).json({
          success: false,
          error: {
            code: 'BUDGET_EXHAUSTED',
            message: 'Department budget is fully exhausted. Please raise a supplementary budget request.',
          },
        });
        return;
      }

      const policyCompliant = policy ? policy.allowedModes.includes(travelType) : true;

      await withTransaction(async (client) => {
        // Generate trip code
        const tripCode = await generateTripCode(employee.dept_code || 'GEN');

        const tripResult = await client.query(
          `INSERT INTO trips (
            trip_code, employee_id, status, travel_type, origin, destination,
            departure_date, return_date, is_round_trip, purpose_of_travel,
            budget_cap, additional_travelers, stay_required, stay_check_in,
            stay_check_out, preferred_hotel_locality, advance_booking_days,
            policy_compliant
          ) VALUES ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          RETURNING *`,
          [
            tripCode, employee.id, travelType, origin, destination,
            departureDate, returnDate || null, isRoundTrip, purposeOfTravel,
            budgetCap, additionalTravelers, stayRequired,
            stayCheckIn || null, stayCheckOut || null, preferredHotelLocality || null,
            advanceBookingDays, policyCompliant,
          ]
        );

        // If late booking, pre-tag exception
        if (lateBooking) {
          await client.query(
            `UPDATE trips SET exception_tag = 'LATE_BOOKING' WHERE id = $1`,
            [tripResult.rows[0].id]
          );
        }

        res.status(201).json({
          success: true,
          data: tripResult.rows[0],
          message: `Trip ${tripCode} created successfully.`,
          meta: {
            policyCompliant,
            lateBooking,
            advanceBookingDays,
            budgetRemaining: budget?.remaining ?? null,
          },
        });
      });
    } catch (err) { next(err); }
  }
);

// POST /api/v1/trips/:id/submit — Submit for approval
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.sub;

    const tripResult = await db.query(
      `SELECT t.*, e.l1_approver_id, e.l2_approver_id, e.grade_level
       FROM trips t
       JOIN employees e ON e.id = t.employee_id
       JOIN users u ON u.id = e.user_id
       WHERE t.id = $1 AND u.id = $2`,
      [req.params.id, userId]
    );
    const trip = tripResult.rows[0];
    if (!trip) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Trip not found.' } });
      return;
    }
    if (trip.status !== 'DRAFT') {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: 'Only DRAFT trips can be submitted.' } });
      return;
    }
    if (!trip.l1_approver_id) {
      res.status(400).json({ success: false, error: { code: 'NO_APPROVER', message: 'No L1 approver mapped. Contact HR.' } });
      return;
    }

    const policy = TRAVEL_POLICIES[trip.grade_level as GradeLevel];
    const slaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24h

    await withTransaction(async (client) => {
      // Update trip status
      await client.query(
        `UPDATE trips SET status = 'L1_PENDING', submitted_at = NOW() WHERE id = $1`,
        [trip.id]
      );

      // Create L1 approval record
      await client.query(
        `INSERT INTO approvals (trip_id, approver_id, level, status, sla_deadline)
         VALUES ($1, $2, 1, 'PENDING', $3)
         ON CONFLICT (trip_id, level) DO UPDATE SET status = 'PENDING', sla_deadline = $3`,
        [trip.id, trip.l1_approver_id, slaDeadline]
      );

      // If policy requires L2, pre-create pending L2 record
      if (policy?.requiresL2Approval && trip.l2_approver_id) {
        const l2Sla = new Date(slaDeadline.getTime() + 24 * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO approvals (trip_id, approver_id, level, status, sla_deadline)
           VALUES ($1, $2, 2, 'PENDING', $3)
           ON CONFLICT (trip_id, level) DO NOTHING`,
          [trip.id, trip.l2_approver_id, l2Sla]
        );
      }

      // Notify L1 approver
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id)
         SELECT u.id, 'APPROVAL_NEEDED',
           'Trip approval required',
           $2 || ' has submitted trip ' || $3 || ' for approval.',
           'TRIP', $4
         FROM employees e JOIN users u ON u.id = e.user_id
         WHERE e.id = $1`,
        [trip.l1_approver_id, trip.employee_name || 'An employee', trip.trip_code, trip.id]
      );
    });

    res.json({ success: true, message: `Trip ${trip.trip_code} submitted for approval.` });
  } catch (err) { next(err); }
});

// POST /api/v1/trips/:id/cancel
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: 'Cancellation reason is required.' } });
      return;
    }
    await db.query(
      `UPDATE trips SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Trip cancelled.' });
  } catch (err) { next(err); }
});

export default router;
