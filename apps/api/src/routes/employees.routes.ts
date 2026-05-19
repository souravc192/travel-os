import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import db, { buildPaginationClause } from '../config/db';

const router = Router();

// GET /api/v1/employees
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', departmentId, gradeLevel } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where: string[] = ['e.is_active = true'];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(e.name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (departmentId) { params.push(departmentId); where.push(`e.department_id = $${params.length}`); }
    if (gradeLevel)   { params.push(gradeLevel);   where.push(`e.grade_level = $${params.length}`); }

    const whereSQL = `WHERE ${where.join(' AND ')}`;
    params.push(lim, offset);

    const result = await db.query(
      `SELECT e.*, u.email, u.role, u.last_login_at,
              d.name AS department_name, cc.code AS cost_centre_code, cc.name AS cost_centre_name,
              l1.name AS l1_approver_name, l2.name AS l2_approver_name
       FROM employees e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN cost_centres cc ON cc.id = e.cost_centre_id
       LEFT JOIN employees l1 ON l1.id = e.l1_approver_id
       LEFT JOIN employees l2 ON l2.id = e.l2_approver_id
       ${whereSQL}
       ORDER BY e.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM employees e JOIN users u ON u.id = e.user_id ${whereSQL}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: result.rows,
      meta: { page: +page, limit: lim, total: +count.rows[0].count },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/employees/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.email, u.role, u.theme, u.last_login_at,
              d.name AS department_name, cc.code AS cost_centre_code, cc.name AS cost_centre_name,
              l1.name AS l1_approver_name, l1.id AS l1_approver_id,
              l2.name AS l2_approver_name, l2.id AS l2_approver_id
       FROM employees e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN cost_centres cc ON cc.id = e.cost_centre_id
       LEFT JOIN employees l1 ON l1.id = e.l1_approver_id
       LEFT JOIN employees l2 ON l2.id = e.l2_approver_id
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found.' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/employees/:id — Update approver mapping, grade etc.
router.patch('/:id', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.TRAVEL_DESK), async (req, res, next) => {
  try {
    const { l1ApproverId, l2ApproverId, gradeLevel, costCentreId } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];

    if (l1ApproverId !== undefined) { params.push(l1ApproverId); updates.push(`l1_approver_id = $${params.length}`); }
    if (l2ApproverId !== undefined) { params.push(l2ApproverId); updates.push(`l2_approver_id = $${params.length}`); }
    if (gradeLevel)   { params.push(gradeLevel);   updates.push(`grade_level = $${params.length}`); }
    if (costCentreId) { params.push(costCentreId); updates.push(`cost_centre_id = $${params.length}`); }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No valid fields to update.' } });
      return;
    }

    params.push(req.params.id);
    await db.query(`UPDATE employees SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    res.json({ success: true, message: 'Employee updated.' });
  } catch (err) { next(err); }
});

export default router;
