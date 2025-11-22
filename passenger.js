// Passenger Startup File for Plesk/cPanel
// This tells Passenger how to start the Node.js application

console.log('Passenger: Loading application...');
console.log('Passenger: CWD:', process.cwd());
console.log('Passenger: Node Version:', process.version);

try {
  require('./app.js');
} catch (error) {
  console.error('Passenger: Failed to load app.js');
  console.error(error);
  throw error;
}
