import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// ─── Error Handler ────────────────────────────────────────────
export function errorHandler(
  err: Error & { status?: number; code?: string },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  logger.error(`[${req.requestId ?? 'unknown'}] ${err.message}`, {
    method: req.method,
    path: req.path,
    status,
    stack: isDev ? err.stack : undefined,
  });

  // Postgres specific errors
  if ('code' in err) {
    if (err.code === '23505') {
      res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_ENTRY', message: 'A record with this value already exists.' },
      });
      return;
    }
    if (err.code === '23503') {
      res.status(400).json({
        success: false,
        error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Referenced record does not exist.' },
      });
      return;
    }
  }

  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isDev ? err.message : 'An unexpected error occurred. Please try again.',
      ...(isDev && { stack: err.stack }),
    },
  });
}
