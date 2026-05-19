import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import db, { buildPaginationClause } from '../config/db';

const router = Router();

// GET /api/v1/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { unreadOnly = 'false', page = 1, limit = 30 } = req.query;
    const { offset, limit: lim } = buildPaginationClause(+page, +limit);

    const where = ['user_id = $1'];
    const params: unknown[] = [req.user!.sub];

    if (unreadOnly === 'true') where.push('is_read = false');

    params.push(lim, offset);

    const result = await db.query(
      `SELECT * FROM notifications
       WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/notifications/count
router.get('/count', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user!.sub]
    );
    res.json({ success: true, data: { unread: +result.rows[0].unread } });
  } catch (err) { next(err); }
});

// PATCH /api/v1/notifications/:id/read
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.sub]
    );
    res.json({ success: true, message: 'Marked as read.' });
  } catch (err) { next(err); }
});

// PATCH /api/v1/notifications/read-all
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false',
      [req.user!.sub]
    );
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
});

export default router;
