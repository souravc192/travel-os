import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import * as authController from '../controllers/auth.controller';

const router = Router();

// POST /api/v1/auth/login
router.post(
  '/login',
  [
    body('email')
      .isEmail().withMessage('Valid email is required.')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Password is required.')
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  ],
  validateRequest,
  authController.login
);

// POST /api/v1/auth/refresh
router.post('/refresh', authController.refreshToken);

// POST /api/v1/auth/logout
router.post('/logout', authenticate, authController.logout);

// POST /api/v1/auth/logout-all
router.post('/logout-all', authenticate, authController.logoutAll);

// GET /api/v1/auth/me
router.get('/me', authenticate, authController.getMe);

// POST /api/v1/auth/onboarding
router.post(
  '/onboarding',
  authenticate,
  [
    body('phone')
      .matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit Indian mobile number is required.'),
    body('designation').optional().isString(),
    body('departmentId').optional().isUUID(),
    body('groupLabel').optional().isString(),
  ],
  validateRequest,
  authController.completeOnboarding
);

// PATCH /api/v1/auth/theme
router.patch(
  '/theme',
  authenticate,
  [
    body('theme')
      .isIn(['corporate-light', 'deep-space-dark', 'forest-professional', 'sunset-warm', 'arctic-blue'])
      .withMessage('Invalid theme.'),
  ],
  validateRequest,
  authController.updateTheme
);

export default router;
