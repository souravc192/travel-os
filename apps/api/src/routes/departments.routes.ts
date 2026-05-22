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

// GET /api/v1/departments/cost-centres — retained for backwards compat (Phase 1 callers)
router.get('/cost-centres', authenticate, async (_req, res, next) => {
  try {
    // Cost-centre concept is deprecated in Phase 3. Returning an empty list
    // is intentional — callers should migrate to /departments.
    res.json({ success: true, data: [] });
  } catch (err) { next(err); }
});

export default router;
