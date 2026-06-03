import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/reimbursements.controller';

const router = Router();

// 15 MB receipt cap
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|png|jpe?g|webp|heic|heif)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Receipt must be PDF / JPG / PNG / WEBP / HEIC.') as never, false);
  },
});

// ── Categories ─────────────────────────────────────────────
router.get('/categories',              authenticate, ctrl.listCategories);
router.post('/categories',             authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  ctrl.createCategory);
router.patch('/categories/:id',        authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  ctrl.updateCategory);

// ── Reimbursement items ────────────────────────────────────
router.patch('/items/:id',                authenticate, ctrl.updateItem);
router.delete('/items/:id',               authenticate, ctrl.deleteItem);
router.post('/items/:id/receipt',         authenticate, upload.single('file'), ctrl.uploadReceipt);
router.get('/items/:id/receipt',          authenticate, ctrl.downloadReceipt);

// ── Reimbursement headers ──────────────────────────────────
router.get('/',                           authenticate, ctrl.listReimbursements);
router.post('/',                          authenticate, ctrl.createReimbursement);
router.get('/:id',                        authenticate, ctrl.getReimbursement);
router.patch('/:id',                      authenticate, ctrl.updateReimbursement);
router.post('/:id/submit',                authenticate, ctrl.submitReimbursement);
router.post('/:id/decide',                authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  ctrl.decideReimbursement);
router.post('/:id/pay',                   authenticate,
  authorize(UserRole.OWNER, UserRole.ADMIN),
  ctrl.markPaid);
router.post('/:id/cancel',                authenticate, ctrl.cancelReimbursement);
router.post('/:id/items',                 authenticate, ctrl.addItem);

export default router;
