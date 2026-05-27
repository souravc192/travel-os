import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/policies.controller';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.pdf$/i.test(file.originalname) ||
               file.mimetype === 'application/pdf';
    if (ok) cb(null, true);
    else cb(new Error('Only PDF files are accepted.') as any, false);
  },
});

// ── Reads (everyone authenticated) ───────────────────────────
router.get('/',                              authenticate, ctrl.listPolicies);
router.get('/:id',                           authenticate, ctrl.getPolicy);
router.get('/:id/versions',                  authenticate, ctrl.listVersions);
router.get('/versions/:versionId',           authenticate, ctrl.getVersion);
router.get('/versions/:versionId/pdf',       authenticate, ctrl.downloadVersionPdf);

// ── Writes (Admin / Owner only) ──────────────────────────────
const writers = authorize(UserRole.ADMIN, UserRole.OWNER);

router.post('/',                                authenticate, writers, ctrl.createPolicy);
router.patch('/:id',                            authenticate, writers, ctrl.updatePolicy);
router.post('/:id/versions',                    authenticate, writers, upload.single('file'), ctrl.uploadVersion);
router.post('/versions/:versionId/publish',     authenticate, writers, ctrl.publishVersion);
router.delete('/versions/:versionId',           authenticate, writers, ctrl.deleteVersion);

export default router;
