import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import db, { buildPaginationClause } from '../config/db';

const router = Router();

// GET /api/v1/users — Super Admin only
router.get('/', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', role } = req.query;
    const { offset, limit: lim, clause } = buildPaginationClause(+page, +limit);

    const where = [];
    const params: unknown[] = [];

    if (search) { params.push(`%${search}%`); where.push(`(u.email ILIKE $${params.length} OR e.name ILIKE $${params.length})`); }
    if (role)   { params.push(role); where.push(`u.role = $${params.length}`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, offset);

    const [data, countRes] = await Promise.all([
      db.query(
        `SELECT u.id, u.email, u.role, u.theme, u.is_active, u.last_login_at, u.created_at,
                e.id AS employee_id, e.name, e.employee_code, e.grade_level, e.designation,
                d.name AS department_name
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN departments d ON d.id = e.department_id
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      db.query(`SELECT COUNT(*) FROM users u LEFT JOIN employees e ON e.user_id = u.id ${whereClause}`,
        params.slice(0, -2)),
    ]);

    res.json({
      success: true,
      data: data.rows,
      meta: { page: +page, limit: lim, total: +countRes.rows[0].count, totalPages: Math.ceil(+countRes.rows[0].count / lim) },
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/users/:id/role
router.patch('/:id/role', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!Object.values(UserRole).includes(role)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ROLE', message: 'Invalid role.' } });
      return;
    }
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
    res.json({ success: true, message: 'Role updated.' });
  } catch (err) { next(err); }
});

// PATCH /api/v1/users/:id/deactivate
router.patch('/:id/deactivate', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res, next) => {
  try {
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'User deactivated.' });
  } catch (err) { next(err); }
});

export default router;
