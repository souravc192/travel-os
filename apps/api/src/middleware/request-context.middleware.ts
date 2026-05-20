import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique X-Request-ID header to every incoming request.
 * If the client already sent one, it is preserved.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers['x-request-id'];
  const fromHeader =
    typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() : '';
  const requestId = fromHeader || uuidv4();
  req.requestId = requestId;
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
