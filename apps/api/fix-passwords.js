require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function fixPasswords() {
  const hash = await bcrypt.hash('Travel@123', 12);
  console.log('Generated hash:', hash);
  
  const result = await pool.query(
    'UPDATE users SET password_hash = $1',
    [hash]
  );
  console.log(`✅ Updated ${result.rowCount} users with correct password hash`);
  
  // Verify
  const verify = await bcrypt.compare('Travel@123', hash);
  console.log('Verification:', verify ? '✅ PASS' : '❌ FAIL');
  
  await pool.end();
}

fixPasswords().catch(err => { console.error(err); process.exit(1); });
