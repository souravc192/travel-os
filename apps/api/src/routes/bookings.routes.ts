import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { UserRole } from '@travel-os/shared-types';
import * as ctrl from '../controllers/bookings.controller';

const router = Router();

// 25 MB invoice cap
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|png|jpe?g|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Invoice must be PDF / JPG / PNG / WEBP.'), ok);
  },
});

// ── Reads ────────────────────────────────────────────────────
router.get('/', authenticate, ctrl.listBookings);
router.get('/by-request/:requestId', authenticate, ctrl.listBookingsForRequest);
router.get('/:id',         authenticate, ctrl.getBooking);
router.get('/:id/invoice', authenticate, ctrl.downloadInvoice);

// ── Writes (Travel Team / Admin / Owner) ─────────────────────
const writers = authorize(UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER);

router.post('/',                  authenticate, writers, ctrl.createBooking);
router.patch('/:id',              authenticate, writers, ctrl.updateBooking);
router.post('/:id/confirm',       authenticate, writers, ctrl.confirmBooking);
router.post('/:id/cancel',        authenticate, writers, ctrl.cancelBooking);
router.post('/:id/reschedule',    authenticate, writers, ctrl.rescheduleBooking);
router.post('/:id/invoice',       authenticate, writers, upload.single('file'), ctrl.uploadInvoice);

export default router;
