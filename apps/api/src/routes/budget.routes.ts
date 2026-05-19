import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/budget.controller';

const router = Router();

// ─── Reads ────────────────────────────────────────────────────
router.get('/summary',      authenticate, ctrl.getSummary);

router.get('/org-overview', authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.FINANCE_ADMIN, UserRole.TRAVEL_DESK),
  ctrl.getOrgOverview);

router.get('/alerts',       authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.FINANCE_ADMIN, UserRole.TRAVEL_DESK),
  ctrl.listAlerts);

router.get('/alert-thresholds', authenticate,
  authorize(UserRole.SUPER_ADMIN, UserRole.FINANCE_ADMIN),
  ctrl.listAlertThresholds);

router.get('/supplementary', authenticate, ctrl.listSupplementary);

router.get('/:id',           authenticate, ctrl.getById);
router.get('/:id/history',   authenticate, ctrl.getHistory);

// ─── Writes ───────────────────────────────────────────────────
router.post('/',  authenticate,
  authorize(UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN),
  ctrl.createAllocation);

router.post('/:id/adjust', authenticate,
  authorize(UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN),
  ctrl.adjustBudget);

router.post('/:id/consume', authenticate,
  authorize(UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN, UserRole.TRAVEL_DESK),
  ctrl.consumeBudget);

router.post('/supplementary', authenticate, ctrl.requestSupplementary);

router.post('/supplementary/:id/approve', authenticate,
  authorize(UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN),
  ctrl.approveSupplementary);

router.post('/alert-thresholds', authenticate,
  authorize(UserRole.FINANCE_ADMIN, UserRole.SUPER_ADMIN),
  ctrl.upsertAlertThreshold);

router.delete('/alert-thresholds/:id', authenticate,
  authorize(UserRole.SUPER_ADMIN),
  ctrl.deleteAlertThreshold);

export default router;
