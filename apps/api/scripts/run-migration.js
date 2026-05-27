/**
 * Run a SQL migration file using DATABASE_URL from apps/api/.env
 * Works on Windows without psql installed.
 *
 * Usage: node scripts/run-migration.js src/migrations/004_phase4_bookings_policy.sql
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Usage: node scripts/run-migration.js <path-to.sql>');
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(sqlPath)) {
  console.error(`Migration file not found: ${sqlPath}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Add it to apps/api/.env');
  process.exit(1);
}

const needsSsl =
  process.env.NODE_ENV === 'production' ||
  process.env.DATABASE_SSL === 'true' ||
  /sslmode=(require|verify-ca|verify-full)/i.test(dbUrl) ||
  /(neon\.tech|supabase\.co|railway\.app|render\.com|aws|azure)/i.test(dbUrl);

async function main() {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({
    connectionString: dbUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });

  console.log(`Running migration: ${path.basename(sqlPath)}`);
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  if (err.detail) console.error('Detail:', err.detail);
  process.exit(1);
});
