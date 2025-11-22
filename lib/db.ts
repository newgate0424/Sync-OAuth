import { db } from './dbAdapter';

// Export the adapter as default for backward compatibility
export default db;

// Export as pool for existing code
export const pool = db;
