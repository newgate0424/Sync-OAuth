const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

// อ่าน MONGODB_URI จาก environment variable หรือใช้ค่าเริ่มต้น
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://sanewgate:newgate0424@data-ads.jxyonoc.mongodb.net/sheets_sync?retryWrites=true&w=majority&authSource=admin";

async function createAdmin() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db('sheets_sync');
    const usersCollection = db.collection('users');
    
    // สร้าง index สำหรับ username (unique)
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    console.log('✓ Created index on username');
    
    // Hash password
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Insert หรือ update admin user
    const result = await usersCollection.updateOne(
      { username: 'admin' },
      {
        $set: {
          username: 'admin',
          password: hashedPassword,
          full_name: 'ผู้ดูแลระบบ',
          role: 'admin',
          is_active: true,
          created_at: new Date(),
          last_login: null
        }
      },
      { upsert: true }
    );
    
    if (result.upsertedCount > 0) {
      console.log('✓ Admin user created!');
    } else {
      console.log('✓ Admin user updated!');
    }
    
    console.log('\n📋 Login credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n🌐 Login at: http://localhost:3000/login');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✓ Connection closed');
  }
}

createAdmin();
