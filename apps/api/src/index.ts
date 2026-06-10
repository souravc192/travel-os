import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { logger } from './config/logger';
import { testDbConnection } from './config/db';
import { testRedisConnection } from './config/redis';
import { initLocalStorage, localUploadDir } from './config/storage';
import { errorHandler } from './middleware/error.middleware';
import { requestContext } from './middleware/request-context.middleware';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import employeeRoutes from './routes/employees.routes';
import departmentRoutes from './routes/departments.routes';
import budgetRoutes from './routes/budget.routes';
import travelRequestRoutes from './routes/travel-requests.routes';
import membersRoutes from './routes/members.routes';
import notificationRoutes from './routes/notifications.routes';
import storageRoutes from './routes/storage.routes';
import bookingsRoutes from './routes/bookings.routes';
import policiesRoutes from './routes/policies.routes';
import reimbursementsRoutes from './routes/reimbursements.routes';
import feedbackRoutes from './routes/feedback.routes';
import complaintsRoutes from './routes/complaints.routes';

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
}));

// ─── Request Middleware ───────────────────────────────────────
app.use(compression());
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ──────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg: string) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// ─── Rate Limiting ────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: isDev ? 5000 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Please slow down.' } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 15,  // Relaxed for dev (login + refresh both hit this)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'AUTH_RATE_LIMIT', message: 'Too many authentication attempts. Try again in 15 minutes.' } },
});

app.use(globalLimiter);
app.use(requestContext); // Attaches X-Request-ID to every req

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    service: 'travel-os-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
  });
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/v1/auth',          authLimiter, authRoutes);
app.use('/api/v1/users',         userRoutes);
app.use('/api/v1/employees',     employeeRoutes);
app.use('/api/v1/departments',   departmentRoutes);
app.use('/api/v1/budget',          budgetRoutes);
app.use('/api/v1/travel-requests', travelRequestRoutes);
app.use('/api/v1/members',         membersRoutes);
app.use('/api/v1/notifications',   notificationRoutes);
app.use('/api/v1/storage',         storageRoutes);
app.use('/api/v1/bookings',        bookingsRoutes);
app.use('/api/v1/policies',        policiesRoutes);
app.use('/api/v1/reimbursements',  reimbursementsRoutes);
app.use('/api/v1/feedback',        feedbackRoutes);
app.use('/api/v1/complaints',      complaintsRoutes);

// ─── Persistent uploads (Railway volume → STORAGE_LOCAL_DIR) ──
app.use('/uploads', express.static(localUploadDir));

// ─── Serve Frontend Static Files ──────────────────────────────
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  logger.info(`Serving static files from: ${webDistPath}`);
  app.use(express.static(webDistPath));

  // Any non-API route is served by index.html for React Router to handle
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(webDistPath, 'index.html'), (err) => {
      if (err) {
        next();
      }
    });
  });
} else {
  logger.warn(`Frontend build directory not found at: ${webDistPath}. Static serving is disabled.`);
}

// ─── API 404 Fallback ─────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested API endpoint does not exist.' },
  });
});

// ─── 404 Handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource or endpoint does not exist.' },
  });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────
async function bootstrap() {
  try {
    initLocalStorage();
    logger.info(`Using storage dir: ${localUploadDir}`);

    await testDbConnection();
    logger.info('✅ PostgreSQL connection established');

    await testRedisConnection();
    logger.info('✅ Redis connection established');

    app.listen(PORT, () => {
      logger.info(`🚀 Travel OS API running on port ${PORT}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   CORS allowed: ${process.env.ALLOWED_ORIGINS || 'http://localhost:5173'}`);
    });
  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

// ─── Graceful Shutdown ────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

export default app;
