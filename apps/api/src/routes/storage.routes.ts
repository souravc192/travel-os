import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import { localUploadDir, storagePath } from '../config/storage';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = storagePath('_test');
      fsSync.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** GET /api/v1/storage/status — verify volume path (Owner/Admin) */
router.get(
  '/status',
  authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const testDir = storagePath('_test');
      await fs.mkdir(testDir, { recursive: true });
      const entries = await fs.readdir(testDir).catch(() => [] as string[]);
      const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? null;

      res.json({
        success: true,
        data: {
          localUploadDir,
          volumeMount,
          testFileCount: entries.length,
          publicBaseUrl: '/uploads',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/v1/storage/test-upload — save file to volume (Owner/Admin) */
router.post(
  '/test-upload',
  authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: 'Upload a file under field "file".' },
        });
        return;
      }

      const relative = path.join('_test', req.file.filename).replace(/\\/g, '/');
      res.json({
        success: true,
        data: {
          filename: req.file.filename,
          path: req.file.path,
          url: `/uploads/${relative}`,
        },
        message: 'File saved to persistent storage. Redeploy and GET the url to verify.',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
