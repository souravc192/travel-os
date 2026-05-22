import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import db, { buildPaginationClause } from '../config/db';

const router = Router();

// GET /api/v1/employees — Members Master listing (post-Phase-3)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', departmentId, group } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where: string[] = ['e.is_active = true'];
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(e.name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.email ILIKE $${params.length})`);
    }
    if (departmentId) { params.push(departmentId); where.push(`e.department_id = $${params.length}`); }
    if (group)        { params.push(group);        where.push(`e.group_label = $${params.length}`); }

    const whereSQL = `WHERE ${where.join(' AND ')}`;
    params.push(lim, offset);

    const result = await db.query(
      `SELECT e.id, e.employee_code, e.name, e.email, e.designation, e.no_of_approvers,
              e.group_label, e.l1_email, e.l2_email, e.l3_email, e.hod_email, e.cxo_email,
              e.phone, e.gender, e.user_id,
              u.role, u.last_login_at,
              d.id AS department_id, d.name AS department_name
         FROM employees e
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN departments d ON d.id = e.department_id
         ${whereSQL}
         ORDER BY e.name
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await db.query(
      `SELECT COUNT(*) FROM employees e ${whereSQL}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: result.rows,
      meta: { page: +page, limit: lim, total: +count.rows[0].count },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/employees/lookup?employeeCode=PW0086 — autofill source for the form
router.get('/lookup', authenticate, async (req, res, next) => {
  try {
    const code = (req.query.employeeCode as string ?? '').trim();
    if (!code) {
      res.status(400).json({ success: false, error: { code: 'EMPLOYEE_CODE_REQUIRED', message: 'employeeCode is required.' } });
      return;
    }
    const result = await db.query(
      `SELECT e.id, e.employee_code, e.name, e.email, e.designation,
              e.l1_email, e.l2_email, e.l3_email, e.no_of_approvers,
              e.group_label, e.phone, e.gender, e.hod_email, e.cxo_email,
              d.id AS department_id, d.name AS department_name
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE UPPER(e.employee_code) = UPPER($1) AND e.is_active = true`,
      [code]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No active employee with that code.' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/v1/employees/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.email AS user_email, u.role, u.theme, u.last_login_at,
              d.name AS department_name
         FROM employees e
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN departments d ON d.id = e.department_id
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

// PATCH /api/v1/employees/:id — Owner/Admin can edit approver chain + department
router.patch('/:id', authenticate, authorize(UserRole.OWNER, UserRole.ADMIN), async (req, res, next) => {
  try {
    const {
      l1Email, l2Email, l3Email, noOfApprovers,
      hodEmail, cxoEmail, departmentId, designation, groupLabel,
    } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];

    function add(col: string, val: unknown) {
      if (val !== undefined) { params.push(val); updates.push(`${col} = $${params.length}`); }
    }
    add('l1_email',        l1Email);
    add('l2_email',        l2Email);
    add('l3_email',        l3Email);
    add('no_of_approvers', noOfApprovers);
    add('hod_email',       hodEmail);
    add('cxo_email',       cxoEmail);
    add('department_id',   departmentId);
    add('designation',     designation);
    add('group_label',     groupLabel);

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
