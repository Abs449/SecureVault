// This script builds the `extension/config.js` file from environment variables
// located in a .env* file (e.g. .env.local). It should be run before packaging
// the Chrome extension so that the Firebase configuration isn't checked into
// source control.

const fs = require('fs');
const path = require('path');

// load dotenv so that `process.env` contains values from .env.local / .env
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`⚠️  Missing environment variables for extension config: ${missing.join(', ')}`);
  console.warn('    The generated config.js will contain empty strings for those values.');
}

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

const output = `window.firebaseConfig = ${JSON.stringify(config, null, 2)};\n`;
const dest = path.join(__dirname, '../extension/config.js');

fs.writeFileSync(dest, output, 'utf8');
console.log(`✅  Generated ${path.relative(process.cwd(), dest)} from environment variables.`);
