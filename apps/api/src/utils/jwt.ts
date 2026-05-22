import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { redis, RedisKey, TTL } from '../config/redis';
import { UserRole, AppTheme } from '@travel-os/shared-types';

// ─── Interfaces ───────────────────────────────────────────────
export interface AccessTokenPayload {
  sub: string;         // user.id
  jti: string;         // unique token ID for blacklisting
  email: string;
  role: UserRole;
  employeeId: string | null;
  theme: AppTheme;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;         // user.id
  jti: string;         // token instance ID (stored in Redis)
  iat: number;
  exp: number;
}

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT secrets are not configured. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.');
}

// ─── Sign Access Token ────────────────────────────────────────
// When Redis is available, tokens are short-lived (15 min) and refreshed
// via httpOnly cookie. Without Redis, use longer expiry (7 days) since
// refresh token rotation can't be validated.
const ACCESS_TOKEN_EXPIRY = redis ? '15m' : '7d';

export function signAccessToken(payload: Omit<AccessTokenPayload, 'jti' | 'iat' | 'exp'>): string {
  return jwt.sign({ ...payload, jti: uuidv4() }, ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
}

// ─── Sign Refresh Token (7 days) ─────────────────────────────
export async function signRefreshToken(userId: string): Promise<{ token: string; jti: string }> {
  const jti = uuidv4();

  const token = jwt.sign({ sub: userId, jti }, REFRESH_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });

  // Store in Redis — key allows multi-device logout
  if (redis) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await redis.setex(RedisKey.refreshToken(userId, jti), TTL.REFRESH_TOKEN, hash);
  }

  return { token, jti };
}

// ─── Verify Access Token ─────────────────────────────────────
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const payload = jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;

  // Check if token has been blacklisted (after logout) — skip if no Redis
  if (redis) {
    const isBlacklisted = await redis.exists(RedisKey.blacklistedToken(payload.jti));
    if (isBlacklisted) {
      throw new Error('Token has been revoked');
    }
  }

  return payload;
}

// ─── Verify Refresh Token ─────────────────────────────────────
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const payload = jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;

  // Validate against Redis store — skip validation if no Redis (dev mode)
  if (redis) {
    const storedHash = await redis.get(RedisKey.refreshToken(payload.sub, payload.jti));
    if (!storedHash) {
      throw new Error('Refresh token not found or expired');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (storedHash !== tokenHash) {
      // Possible token theft — invalidate all sessions for this user
      await revokeAllUserTokens(payload.sub);
      throw new Error('Refresh token mismatch — all sessions revoked for security');
    }
  }

  return payload;
}

// ─── Blacklist Access Token ────────────────────────────────────
export async function blacklistAccessToken(jti: string): Promise<void> {
  if (!redis) return;
  // Keep in Redis until natural expiry (20 min)
  await redis.setex(RedisKey.blacklistedToken(jti), TTL.ACCESS_TOKEN_BLACKLIST, '1');
}

// ─── Revoke Refresh Token ─────────────────────────────────────
export async function revokeRefreshToken(userId: string, jti: string): Promise<void> {
  if (!redis) return;
  await redis.del(RedisKey.refreshToken(userId, jti));
}

// ─── Revoke ALL tokens for a user (security incident / forced logout) ──
export async function revokeAllUserTokens(userId: string): Promise<void> {
  if (!redis) return;
  const keys = await redis.keys(`rt:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// ─── Extract token from Authorization header ──────────────────
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
