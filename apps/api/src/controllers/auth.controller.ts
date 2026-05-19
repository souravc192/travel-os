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
import { AppTheme, GradeLevel } from '@travel-os/shared-types';

// ─── POST /auth/login ─────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;

    // 1. Find user
    const userResult = await db.query(
      `SELECT u.*, e.id AS employee_id, e.name, e.onboarding_complete,
              e.grade_level, e.department_id, e.cost_centre_id
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
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TTL.REFRESH_TOKEN * 1000,
      path: '/api/v1/auth',
    });

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
          gradeLevel: user.grade_level,
          departmentId: user.department_id,
          costCentreId: user.cost_centre_id,
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

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: TTL.REFRESH_TOKEN * 1000,
      path: '/api/v1/auth',
    });

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
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });

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
    res.clearCookie('refreshToken', { path: '/api/v1/auth' });

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
        e.grade_level, e.phone, e.avatar_url, e.onboarding_complete,
        e.cost_centre_id, e.department_id,
        d.name AS department_name, d.code AS department_code,
        cc.code AS cost_centre_code, cc.name AS cost_centre_name,
        l1.name AS l1_approver_name, l1.id AS l1_approver_id,
        l2.name AS l2_approver_name, l2.id AS l2_approver_id
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN cost_centres cc ON cc.id = e.cost_centre_id
       LEFT JOIN employees l1 ON l1.id = e.l1_approver_id
       LEFT JOIN employees l2 ON l2.id = e.l2_approver_id
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
          gradeLevel: row.grade_level,
          phone: row.phone,
          avatarUrl: row.avatar_url,
          onboardingComplete: row.onboarding_complete,
          departmentId: row.department_id,
          departmentName: row.department_name,
          departmentCode: row.department_code,
          costCentreId: row.cost_centre_id,
          costCentreCode: row.cost_centre_code,
          costCentreName: row.cost_centre_name,
          l1Approver: row.l1_approver_id ? { id: row.l1_approver_id, name: row.l1_approver_name } : null,
          l2Approver: row.l2_approver_id ? { id: row.l2_approver_id, name: row.l2_approver_name } : null,
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
    const { designation, departmentId, costCentreId, phone, gradeLevel } = req.body;
    const userId = req.user!.sub;
    const employeeId = req.user!.employeeId;

    if (!employeeId) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_EMPLOYEE_RECORD', message: 'No employee record linked to this user.' },
      });
      return;
    }

    // Validate grade level
    if (!Object.values(GradeLevel).includes(gradeLevel)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_GRADE', message: 'Invalid grade level.' },
      });
      return;
    }

    await db.query(
      `UPDATE employees SET
        designation = $1, department_id = $2, cost_centre_id = $3,
        phone = $4, grade_level = $5, onboarding_complete = true
       WHERE id = $6`,
      [designation, departmentId, costCentreId, phone, gradeLevel, employeeId]
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
