import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/members.controller';

const router = Router();

// 50 MB cap — handles 17k row sheets comfortably
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname) ||
               file.mimetype.includes('spreadsheet') ||
               file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    cb(ok ? null : new Error('Only .xlsx files are accepted.'), ok);
  },
});

router.post('/import',
  authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  upload.single('file'),
  ctrl.importMembers
);

export default router;
