import { Pool, PoolClient } from 'pg';
import { logger } from './logger';

// ─── Connection Pool ─────────────────────────────────────────
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Max pool connections
  idleTimeoutMillis: 30_000,  // Remove idle connections after 30s
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

db.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
});

db.on('connect', () => {
  logger.debug('New PostgreSQL client connected to pool');
});

// ─── Health Check ─────────────────────────────────────────────
export async function testDbConnection(): Promise<void> {
  const client = await db.connect();
  try {
    const res = await client.query('SELECT NOW() as now, current_database() as db');
    logger.info(`PostgreSQL connected — DB: ${res.rows[0].db}, Server time: ${res.rows[0].now}`);
  } finally {
    client.release();
  }
}

// ─── Transaction Helper ───────────────────────────────────────
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Query Helper with Audit Context ──────────────────────────
// Sets the app.current_user_id session var so audit triggers can read it
export async function queryWithUser<T extends object = object>(
  sql: string,
  params: unknown[],
  userId: string
): Promise<T[]> {
  const client = await db.connect();
  try {
    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    const result = await client.query<T>(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// ─── Pagination Helper ────────────────────────────────────────
export function buildPaginationClause(page = 1, limit = 20): { offset: number; limit: number; clause: string } {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const offset = (safePage - 1) * safeLimit;
  return { offset, limit: safeLimit, clause: `LIMIT ${safeLimit} OFFSET ${offset}` };
}

export default db;
