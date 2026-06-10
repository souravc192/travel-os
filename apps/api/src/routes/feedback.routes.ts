import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/feedback.controller';

const router = Router();

// Org-wide feedback (analytics) — Travel Team / Admin / Owner
router.get('/', authenticate,
  authorize(UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER),
  ctrl.listFeedback);

// Feedback for a specific trip (+ eligibility flags)
router.get('/by-request/:requestId', authenticate, ctrl.getByRequest);

// Submit feedback (claimant, within window)
router.post('/', authenticate, ctrl.createFeedback);

export default router;
