/**
 * Run all migrations in order, skipping any already recorded in schema_migrations.
 *
 * Usage: node scripts/run-all-migrations.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const {
  MIGRATIONS,
  bootstrapIfNeeded,
  isApplied,
  recordApplied,
} = require('./migration-tracker');

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
  const client = new Client({
    connectionString: dbUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    await bootstrapIfNeeded(client);

    let ran = 0;
    let skipped = 0;

    for (const { file } of MIGRATIONS) {
      const sqlPath = path.resolve(process.cwd(), 'src/migrations', file);
      if (!fs.existsSync(sqlPath)) {
        console.warn(`Skipping ${file} — file not found`);
        continue;
      }

      if (await isApplied(client, file)) {
        console.log(`Skipping ${file} (already applied)`);
        skipped++;
        continue;
      }

      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      await recordApplied(client, file);
      console.log(`Completed: ${file}`);
      ran++;
    }

    console.log(`\nDone. ${ran} applied, ${skipped} skipped.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  if (err.detail) console.error('Detail:', err.detail);
  process.exit(1);
});
