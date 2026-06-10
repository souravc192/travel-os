import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/complaints.controller';

const router = Router();

// ── Staff picker + analytics (managers only) ───────────────
router.get('/assignable-users',  authenticate,
  authorize(UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.listAssignableUsers);
router.get('/analytics/vendors', authenticate,
  authorize(UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.vendorAnalytics);

// ── Headers ────────────────────────────────────────────────
router.get('/',          authenticate, ctrl.listComplaints);
router.post('/',         authenticate, ctrl.createComplaint);
router.get('/:id',       authenticate, ctrl.getComplaint);

// ── Workflow transitions ───────────────────────────────────
router.post('/:id/assign',   authenticate,
  authorize(UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.assignComplaint);
router.post('/:id/status',   authenticate, ctrl.updateStatus);
router.post('/:id/resolve',  authenticate, ctrl.resolveComplaint);
router.post('/:id/close',    authenticate, ctrl.closeComplaint);
router.post('/:id/comments', authenticate, ctrl.addComment);

export default router;
