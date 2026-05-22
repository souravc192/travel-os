import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/budget.controller';

const router = Router();

// ─── Reads ────────────────────────────────────────────────────
router.get('/summary', authenticate, ctrl.getMyBudget);

router.get('/org-overview', authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN, UserRole.TRAVEL_TEAM),
  ctrl.getOrgOverview);

router.get('/addition-requests', authenticate, ctrl.listAdditionRequests);

router.get('/:id',         authenticate, ctrl.getById);
router.get('/:id/history', authenticate, ctrl.getHistory);

// ─── Writes ───────────────────────────────────────────────────
router.post('/', authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  ctrl.upsertAllocation);

router.post('/:id/adjust', authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  ctrl.adjustBudget);

router.post('/:id/consume', authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN, UserRole.TRAVEL_TEAM),
  ctrl.consumeBudget);

router.post('/addition-requests', authenticate,
  authorize(UserRole.HOD, UserRole.ADMIN, UserRole.OWNER),
  ctrl.requestAddition);

router.post('/addition-requests/:id/decide', authenticate,
  authorize(UserRole.ADMIN, UserRole.OWNER),
  ctrl.decideAddition);

export default router;
