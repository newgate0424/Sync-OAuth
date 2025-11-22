#!/usr/bin/env node

/**
 * Production server entry point for Plesk/cPanel/Passenger
 * This file is used as the main application startup file
 */

// Load environment variables first
const path = require('path');
const fs = require('fs');

// Check if dotenv exists before loading
try {
  require('dotenv').config();
} catch (e) {
  console.warn('dotenv not available, using environment variables from system');
}

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Log startup
console.log('='.repeat(50));
console.log('Starting Application');
console.log('='.repeat(50));
console.log('Node Version:', process.version);
console.log('CWD:', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

// Check critical files
try {
  const envPath = path.join(process.cwd(), '.env');
  const credPath = path.join(process.cwd(), 'credentials.json');
  const nextPath = path.join(process.cwd(), '.next');
  
  console.log('.env exists:', fs.existsSync(envPath));
  console.log('credentials.json exists:', fs.existsSync(credPath));
  console.log('.next exists:', fs.existsSync(nextPath));
  
  if (!fs.existsSync(nextPath)) {
    console.error('ERROR: .next folder not found. Please run: npm run build');
  }
} catch (error) {
  console.error('Error checking files:', error.message);
}

// Configuration
const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all interfaces
const port = parseInt(process.env.PORT || '3000', 10);

console.log('Server config:', { dev, hostname, port });

// Initialize Next.js
let app, handle;

try {
  app = next({ 
    dev, 
    hostname, 
    port,
    dir: process.cwd()
  });
  handle = app.getRequestHandler();
} catch (error) {
  console.error('ERROR: Failed to initialize Next.js');
  console.error(error);
  process.exit(1);
}

// Prepare and start server
console.log('Preparing Next.js...');
app.prepare()
  .then(() => {
    console.log('Next.js prepared successfully');
    

    
    const server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error handling request:', req.url);
        console.error('Error:', err.message);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html');
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Error - Application</title></head>
            <body style="font-family: Arial, sans-serif; padding: 50px; text-align: center;">
              <h1>Application Error</h1>
              <p>The application encountered an error while processing your request.</p>
              <p style="color: #666;">Error: ${err.message}</p>
              <hr>
              <p><a href="/">Go to Home</a></p>
            </body>
          </html>
        `);
      }
    });
    
    server.once('error', (err) => {
      console.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
      }
      process.exit(1);
    });
    
    server.listen(port, hostname, () => {
      console.log('='.repeat(50));
      console.log('SERVER STARTED SUCCESSFULLY');
      console.log('='.repeat(50));
      console.log(`URL: http://${hostname}:${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`MongoDB: ${process.env.MONGODB_URI ? 'Configured' : 'Not configured'}`);
      console.log(`Database: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`);
      console.log('='.repeat(50));
      console.log('Application is ready to accept connections');
    });
  })
  .catch((err) => {
    console.error('='.repeat(50));
    console.error('FAILED TO START APPLICATION');
    console.error('='.repeat(50));
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    
    // Log helpful debug info
    console.error('');
    console.error('Debug Information:');
    console.error('- CWD:', process.cwd());
    console.error('- Node Version:', process.version);
    console.error('- .next exists:', fs.existsSync(path.join(process.cwd(), '.next')));
    console.error('- package.json exists:', fs.existsSync(path.join(process.cwd(), 'package.json')));
    
    console.error('='.repeat(50));
    process.exit(1);
  });
