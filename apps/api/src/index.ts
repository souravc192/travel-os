import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';

import { logger } from './config/logger';
import { testDbConnection } from './config/db';
import { testRedisConnection } from './config/redis';
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

// ─── 404 Handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested endpoint does not exist.' },
  });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────
async function bootstrap() {
  try {
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
