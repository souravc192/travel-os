/**
 * Create a new user with employee profile in Travel OS.
 * Usage: node create-user.js <email> <password> "<full_name>" [role]
 * Example: node create-user.js sourav@example.com MySecurePass "Sourav Kumar" OWNER
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL is not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('\n📖 Usage: node create-user.js <email> <password> "<full_name>" [role]');
    console.log('   - Role can be: OWNER, ADMIN, TRAVEL_TEAM, HOD, USER (default: USER)\n');
    process.exit(1);
  }

  const email = args[0].toLowerCase().trim();
  const password = args[1];
  const name = args[2];
  const role = (args[3] || 'USER').toUpperCase();

  const validRoles = ['OWNER', 'ADMIN', 'TRAVEL_TEAM', 'HOD', 'USER'];
  if (!validRoles.includes(role)) {
    console.error(`❌ Invalid role: "${role}". Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // 1. Check if user already exists
    const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      console.error(`❌ User with email "${email}" already exists.`);
      process.exit(1);
    }

    console.log(`⏳ Hashing password...`);
    const passwordHash = await bcrypt.hash(password, 12);

    console.log(`⏳ Inserting user and employee record...`);
    
    // Start transaction
    await client.query('BEGIN');

    const userId = uuidv4();
    const employeeId = uuidv4();
    
    // Insert into users
    await client.query(
      `INSERT INTO users (id, email, password_hash, role, theme, is_active)
       VALUES ($1, $2, $3, $4, 'deep-space-dark', true)`,
      [userId, email, passwordHash, role]
    );

    // Get the "Unassigned" department (or any default)
    let departmentId = null;
    const deptResult = await client.query("SELECT id FROM departments WHERE code = 'UNASSIGNED' OR code = 'TECH-ENG' LIMIT 1");
    if (deptResult.rows.length > 0) {
      departmentId = deptResult.rows[0].id;
    }

    // Generate random PWXXXX employee code
    const empCode = 'PW' + Math.floor(1000 + Math.random() * 9000);

    // Split name for first/last
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Insert into employees
    await client.query(
      `INSERT INTO employees (
        id, user_id, employee_code, name, email, first_name, last_name, 
        designation, department_id, onboarding_complete, is_active, no_of_approvers
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, 1)`,
      [employeeId, userId, empCode, name, email, firstName, lastName, 'Team Member', departmentId]
    );

    await client.query('COMMIT');
    console.log(`\n🎉 User successfully created!`);
    console.log(`   - Email:         ${email}`);
    console.log(`   - Role:          ${role}`);
    console.log(`   - Employee Code: ${empCode}`);
    console.log(`   - Password:      (your provided password)`);
    console.log(`\nYou can now log in at http://localhost:5173 using these credentials! 🚀\n`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating user:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
