import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/travel-requests.controller';

const router = Router();

router.post('/',                authenticate, ctrl.createRequest);
router.get( '/',                authenticate, ctrl.listRequests);
router.get( '/pending-approvals', authenticate,
  authorize(UserRole.HOD, UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.listPendingApprovals);
router.get( '/:id',             authenticate, ctrl.getRequest);
router.post('/:id/approve',     authenticate,
  authorize(UserRole.HOD, UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.approveRequest);
router.post('/:id/reject',      authenticate,
  authorize(UserRole.HOD, UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.rejectRequest);
router.post('/:id/cancel',      authenticate, ctrl.cancelRequest);
router.post('/:id/complete',    authenticate,
  authorize(UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.completeRequest);

export default router;
