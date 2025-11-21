const { MongoClient } = require('mongodb');

async function checkMongoSettings() {
  const uri = 'mongodb+srv://sanewgate:newgate0424@data-ads.jxyonoc.mongodb.net/sheets_sync?retryWrites=true&w=majority&authSource=admin';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('sheets_sync');
    const settings = await db.collection('settings').findOne({ key: 'database_connection' });
    
    console.log('Settings from MongoDB:');
    if (settings) {
      console.log('Found database_connection setting:');
      console.log(JSON.stringify(settings, null, 2));
    } else {
      console.log('No database_connection setting found in MongoDB.');
      console.log('Application should be using DATABASE_URL from .env');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

checkMongoSettings();
