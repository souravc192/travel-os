import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken, AccessTokenPayload } from '../utils/jwt';
import { UserRole } from '@travel-os/shared-types';

// ─── Augment Express Request ──────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      requestId?: string;
    }
  }
}

// ─── Require Authentication ───────────────────────────────────
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'NO_TOKEN', message: 'Authentication token is required.' },
      });
      return;
    }

    const payload = await verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    const isExpired = message.includes('jwt expired');
    res.status(401).json({
      success: false,
      error: {
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Session expired. Please refresh your token.' : message,
      },
    });
  }
}

// ─── Role-Based Access Control ────────────────────────────────
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be logged in.' },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `This action requires one of: ${allowedRoles.join(', ')}. Your role: ${req.user.role}`,
        },
      });
      return;
    }

    next();
  };
}

// ─── Self-or-Admin Guard ──────────────────────────────────────
// Allows the user to access their own resources, or admins to access any
export function selfOrAdmin(userIdParam = 'userId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' } });
      return;
    }

    const isAdmin = [UserRole.OWNER, UserRole.ADMIN, UserRole.TRAVEL_TEAM].includes(req.user.role);
    const isSelf = req.user.sub === req.params[userIdParam];

    if (!isAdmin && !isSelf) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only access your own resources.' },
      });
      return;
    }

    next();
  };
}

// ─── Optional Auth (for public routes that benefit from user context) ──
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (token) {
      req.user = await verifyAccessToken(token);
    }
  } catch {
    // Silent fail — user is just unauthenticated
  }
  next();
}
