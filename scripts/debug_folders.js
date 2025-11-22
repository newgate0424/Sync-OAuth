
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.local' }); // Load .env.local file

async function checkData() {
  const uri = process.env.DATABASE_USER_URL;
  if (!uri) {
      console.error('DATABASE_USER_URL not found in .env');
      return;
  }
  console.log('Using MongoDB URI:', uri.replace(/:([^:@]+)@/, ':****@')); // Mask password

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db();

    console.log('Connected to MongoDB');

    const folders = await db.collection('folders').find({}).toArray();
    console.log(`Found ${folders.length} folders`);

    for (const folder of folders) {
      console.log(`Folder: ${folder.name}, ID: ${folder._id} (Type: ${typeof folder._id})`);
      
      // Check folder_tables with ObjectId
      const tablesObjectId = await db.collection('folder_tables').find({ folder_id: folder._id }).toArray();
      console.log(`  Tables (query by ObjectId): ${tablesObjectId.length}`);
      
      // Check folder_tables with String
      const tablesString = await db.collection('folder_tables').find({ folder_id: folder._id.toString() }).toArray();
      console.log(`  Tables (query by String): ${tablesString.length}`);

      if (tablesObjectId.length > 0) {
          console.log('  Sample table (ObjectId):', tablesObjectId[0]);
      }
       if (tablesString.length > 0) {
          console.log('  Sample table (String):', tablesString[0]);
      }
    }

  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

checkData();
