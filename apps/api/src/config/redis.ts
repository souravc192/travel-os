import Redis from 'ioredis';
import { logger } from './logger';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 5) {
      logger.error('Redis: Max retries exceeded, giving up');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on('error', (err) => logger.error('Redis error:', err));
redis.on('connect', () => logger.info('Redis connected'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export async function testRedisConnection(): Promise<void> {
  await redis.connect();
  await redis.ping();
  logger.info('Redis ping: PONG ✓');
}

// ─── TTL Constants ────────────────────────────────────────────
export const TTL = {
  REFRESH_TOKEN: 7 * 24 * 60 * 60,       // 7 days
  ACCESS_TOKEN_BLACKLIST: 20 * 60,        // 20 min (slightly > access token lifetime)
  VENDOR_RATES: 6 * 60 * 60,             // 6 hours
  VENDOR_RATES_STALE: 24 * 60 * 60,      // 24 hours (stale fallback)
  USER_SESSION: 24 * 60 * 60,            // 24 hours
  OTP: 10 * 60,                          // 10 min
  NOTIFICATION_CACHE: 5 * 60,            // 5 min
  BUDGET_SUMMARY: 2 * 60,               // 2 min (frequently read)
} as const;

// ─── Key Builders ─────────────────────────────────────────────
export const RedisKey = {
  refreshToken:       (userId: string, tokenId: string) => `rt:${userId}:${tokenId}`,
  blacklistedToken:   (jti: string) => `bl:${jti}`,
  userSession:        (userId: string) => `session:${userId}`,
  vendorRates:        (origin: string, dest: string, date: string) => `rates:${origin}:${dest}:${date}`,
  budgetSummary:      (costCentreId: string) => `budget:${costCentreId}`,
  pendingApprovals:   (approverId: string) => `approvals:pending:${approverId}`,
  notifications:      (userId: string) => `notif:${userId}`,
  tripCodeSeq:        (dept: string, year: string) => `tripseq:${dept}:${year}`,
} as const;

// ─── Helpers ──────────────────────────────────────────────────
export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await redis.get(key);
  return val ? (JSON.parse(val) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  await redis.del(key);
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export default redis;
