import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import db from '../config/db';

const router = Router();

// GET /api/v1/departments
router.get('/', authenticate, async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT d.*, e.name AS head_name
       FROM departments d
       LEFT JOIN employees e ON e.id = d.head_id
       WHERE d.is_active = true
       ORDER BY d.name`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/departments/cost-centres
router.get('/cost-centres', authenticate, async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT cc.*, d.name AS department_name, d.code AS department_code
       FROM cost_centres cc
       JOIN departments d ON d.id = cc.department_id
       WHERE cc.is_active = true
       ORDER BY d.name, cc.name`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

export default router;
