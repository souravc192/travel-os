/**
 * Run Phase 3 SQL migrations against NeonDB.
 * Usage: node run-phase3-migrations.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

const MIGRATIONS = [
  '003_phase3_overhaul.sql',
  '003b_seed.sql',
];

async function run() {
  const client = await pool.connect();
  try {
    for (const file of MIGRATIONS) {
      const filePath = path.join(__dirname, 'src', 'migrations', file);
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Skipping ${file} — file not found`);
        continue;
      }
      console.log(`\n📦 Running migration: ${file} ...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`✅ ${file} — done`);
    }
    console.log('\n🎉 All Phase 3 migrations completed successfully!');
  } catch (err) {
    console.error(`\n❌ Migration failed:`, err.message);
    if (err.message.includes('already exists')) {
      console.log('ℹ️  This likely means the migration was already applied.');
    } else {
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run();
