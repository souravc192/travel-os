require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function fixPasswords() {
  const hash = await bcrypt.hash('Travel@123', 12);
  console.log('Generated hash for Travel@123');
  
  const result = await pool.query(
    'UPDATE users SET password_hash = $1',
    [hash]
  );
  console.log(`✅ Updated ${result.rowCount} users with correct password hash`);
  
  // Show all users
  const users = await pool.query('SELECT email, role FROM users ORDER BY role');
  console.log('\n📋 Users in database:');
  users.rows.forEach(u => console.log(`   ${u.email} (${u.role})`));
  
  await pool.end();
}

fixPasswords().catch(err => { console.error(err); process.exit(1); });
