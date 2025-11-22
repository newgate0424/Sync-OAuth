const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: 'postgresql://postgres:NewStrongPassword123!@127.0.0.1:5432/ads_data',
  ssl: false
});

async function createAdmin() {
  try {
    // Add full_name column if it doesn't exist
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    console.log('✓ Checked users table schema');
    
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    await pool.query(
      `INSERT INTO users (username, password, full_name, role) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (username) 
       DO UPDATE SET password = EXCLUDED.password, full_name = EXCLUDED.full_name`,
      ['admin', hashedPassword, 'ผู้ดูแลระบบ', 'admin']
    );
    
    console.log('✓ Admin user created');
    console.log('  Username: admin');
    console.log('  Password:', process.env.ADMIN_PASSWORD || 'admin123');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

createAdmin();
