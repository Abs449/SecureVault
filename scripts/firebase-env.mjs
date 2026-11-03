// Reads the Firebase web config from .env.local / .env (the same NEXT_PUBLIC_FIREBASE_*
// variables the Next.js app uses). Exits with a clear message if any are missing.

import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

const KEYS = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
};

export function loadFirebaseConfig(root) {
  loadEnv({ path: join(root, '.env.local'), quiet: true });
  loadEnv({ path: join(root, '.env'), quiet: true });
  const missing = Object.values(KEYS).filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`\nMissing Firebase settings in .env.local:\n  ${missing.join('\n  ')}\n`);
    process.exit(1);
  }
  return Object.fromEntries(Object.entries(KEYS).map(([k, env]) => [k, process.env[env].trim()]));
}
