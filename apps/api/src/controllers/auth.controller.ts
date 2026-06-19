import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db';
import { redis, RedisKey, TTL } from '../config/redis';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  blacklistAccessToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  extractBearerToken,
} from '../utils/jwt';
import { logger } from '../config/logger';
import { AppTheme } from '@travel-os/shared-types';

// ─── Refresh-token cookie options ─────────────────────────────
// When the web app and API live on the SAME origin (single-server / local
// dev), `sameSite: 'lax'` is correct. When they're on DIFFERENT domains
// (e.g. web on Vercel, API on Railway), the browser will only send the
// cookie cross-site if it's `sameSite: 'none'` AND `secure: true`.
// Set CROSS_SITE_COOKIE=true on the API host for the split deployment.
const isProd      = process.env.NODE_ENV === 'production';
const crossSite   = process.env.CROSS_SITE_COOKIE === 'true';
const COOKIE_PATH = '/api/v1/auth';

const refreshCookieOptions = {
  httpOnly: true,
  secure:   isProd || crossSite,          // 'none' requires Secure
  sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax',
  maxAge:   TTL.REFRESH_TOKEN * 1000,
  path:     COOKIE_PATH,
};

// ─── POST /auth/login ─────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;

    // 1. Find user
    const userResult = await db.query(
      `SELECT u.*, e.id AS employee_id, e.name, e.onboarding_complete,
              e.group_label, e.department_id
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.email = $1 AND u.is_active = true`,
      [email.toLowerCase().trim()]
    );

    const user = userResult.rows[0];

    if (!user) {
      // Constant-time comparison to prevent user enumeration
      await bcrypt.compare(password, '$2b$12$invalidhashtopreventtiming.........');
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
      return;
    }

    // 2. Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      logger.warn(`Failed login attempt for email: ${email}, IP: ${req.ip}`);
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
      return;
    }

    // 3. Generate tokens
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id || null,
      theme: user.theme as AppTheme,
    });

    const { token: refreshToken, jti } = await signRefreshToken(user.id);

    // 4. Update last login
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 5. Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    logger.info(`User logged in: ${email} (${user.role})`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          theme: user.theme,
          lastLoginAt: user.last_login_at,
        },
        employee: user.employee_id ? {
          id: user.employee_id,
          name: user.name,
          groupLabel: user.group_label,
          departmentId: user.department_id,
          onboardingComplete: user.onboarding_complete,
        } : null,
        requiresOnboarding: user.employee_id
          ? !user.onboarding_complete
          : false,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/refresh ───────────────────────────────────────
export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;

    if (!token) {
      res.status(401).json({
        success: false,
        error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token not provided.' },
      });
      return;
    }

    // Verify & validate against Redis
    const payload = await verifyRefreshToken(token);

    // Fetch current user data (role/theme may have changed)
    const userResult = await db.query(
      `SELECT u.*, e.id AS employee_id FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1 AND u.is_active = true`,
      [payload.sub]
    );

    const user = userResult.rows[0];
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User no longer exists or is deactivated.' },
      });
      return;
    }

    // Rotate: revoke old, issue new refresh token (sliding window)
    await revokeRefreshToken(payload.sub, payload.jti);
    const { token: newRefreshToken } = await signRefreshToken(user.id);

    const newAccessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee_id || null,
      theme: user.theme as AppTheme,
    });

    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions);

    res.json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    res.status(401).json({
      success: false,
      error: { code: 'REFRESH_FAILED', message: msg || 'Token refresh failed.' },
    });
  }
}

// ─── POST /auth/logout ────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Blacklist current access token
    const accessToken = extractBearerToken(req.headers.authorization);
    if (accessToken && req.user?.jti) {
      await blacklistAccessToken(req.user.jti);
    }

    // Revoke refresh token from Redis
    const refreshTokenCookie = req.cookies.refreshToken;
    if (refreshTokenCookie && req.user?.sub) {
      try {
        const payload = await verifyRefreshToken(refreshTokenCookie);
        await revokeRefreshToken(payload.sub, payload.jti);
      } catch {
        // Refresh token already expired, safe to ignore
      }
    }

    // Clear cookie
    res.clearCookie('refreshToken', {
      path:     COOKIE_PATH,
      secure:   refreshCookieOptions.secure,
      sameSite: refreshCookieOptions.sameSite,
    });

    logger.info(`User logged out: ${req.user?.email}`);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/logout-all ────────────────────────────────────
export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated.' } });
      return;
    }

    await revokeAllUserTokens(req.user.sub);
    if (req.user.jti) await blacklistAccessToken(req.user.jti);
    res.clearCookie('refreshToken', {
      path:     COOKIE_PATH,
      secure:   refreshCookieOptions.secure,
      sameSite: refreshCookieOptions.sameSite,
    });

    logger.info(`All sessions revoked for user: ${req.user.email}`);
    res.json({ success: true, message: 'All sessions logged out.' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /auth/me ─────────────────────────────────────────────
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query(
      `SELECT
        u.id, u.email, u.role, u.theme, u.last_login_at, u.created_at,
        e.id AS employee_id, e.employee_code, e.name, e.designation,
        e.group_label, e.phone, e.avatar_url, e.onboarding_complete,
        e.department_id, e.l1_email, e.l2_email, e.l3_email,
        e.no_of_approvers, e.hod_email, e.cxo_email,
        d.name AS department_name, d.code AS department_code
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE u.id = $1`,
      [req.user!.sub]
    );

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: row.id,
          email: row.email,
          role: row.role,
          theme: row.theme,
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at,
        },
        employee: row.employee_id ? {
          id: row.employee_id,
          employeeCode: row.employee_code,
          name: row.name,
          designation: row.designation,
          groupLabel: row.group_label,
          phone: row.phone,
          avatarUrl: row.avatar_url,
          onboardingComplete: row.onboarding_complete,
          departmentId: row.department_id,
          departmentName: row.department_name,
          departmentCode: row.department_code,
          l1Email: row.l1_email,
          l2Email: row.l2_email,
          l3Email: row.l3_email,
          hodEmail: row.hod_email,
          cxoEmail: row.cxo_email,
          noOfApprovers: row.no_of_approvers,
        } : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/onboarding ────────────────────────────────────
export async function completeOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { designation, departmentId, phone, groupLabel } = req.body;
    const employeeId = req.user!.employeeId;

    if (!employeeId) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_EMPLOYEE_RECORD', message: 'No employee record linked to this user.' },
      });
      return;
    }

    await db.query(
      `UPDATE employees SET
        designation = COALESCE($1, designation),
        department_id = COALESCE($2, department_id),
        phone = COALESCE($3, phone),
        group_label = COALESCE($4, group_label),
        onboarding_complete = true
       WHERE id = $5`,
      [designation, departmentId, phone, groupLabel, employeeId]
    );

    logger.info(`Onboarding complete for employee: ${employeeId}`);

    res.json({
      success: true,
      message: 'Onboarding complete! Welcome to Travel OS.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /auth/theme ────────────────────────────────────────
export async function updateTheme(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { theme } = req.body;
    const validThemes = Object.values(AppTheme);

    if (!validThemes.includes(theme)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_THEME', message: `Theme must be one of: ${validThemes.join(', ')}` },
      });
      return;
    }

    await db.query('UPDATE users SET theme = $1 WHERE id = $2', [theme, req.user!.sub]);

    res.json({ success: true, data: { theme }, message: 'Theme updated.' });
  } catch (err) {
    next(err);
  }
}
