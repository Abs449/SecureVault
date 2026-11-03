// Builds the Chrome extension into dist/extension.
//
//   npm run build:extension         production build
//   npm run dev:extension           rebuild on change (unminified, with source maps)
//
// Firebase settings are read from .env.local (the same NEXT_PUBLIC_FIREBASE_* values the
// web app uses) and compiled into the bundle, so there is no separate config file to manage.

import { build, context } from 'esbuild';
import { config as loadEnv } from 'dotenv';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'extension');
const outDir = join(root, 'dist', 'extension');
const watch = process.argv.includes('--watch');

loadEnv({ path: join(root, '.env.local'), quiet: true });
loadEnv({ path: join(root, '.env'), quiet: true });

const ENV_KEYS = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'NEXT_PUBLIC_FIREBASE_APP_ID',
};

const missing = Object.values(ENV_KEYS).filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\nCannot build the extension. Missing in .env.local:\n  ${missing.join('\n  ')}\n`);
  process.exit(1);
}
const firebaseConfig = Object.fromEntries(Object.entries(ENV_KEYS).map(([k, env]) => [k, process.env[env]]));

for (const size of [16, 32, 48, 128]) {
  if (!existsSync(join(srcDir, 'icons', `icon${size}.png`))) {
    console.error(`Missing extension/icons/icon${size}.png. Run "npm run icons".`);
    process.exit(1);
  }
}

function copyStatic() {
  mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf8'));
  manifest.version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version.replace(/-.*$/, '');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  cpSync(join(srcDir, 'src', 'popup.html'), join(outDir, 'popup.html'));
  cpSync(join(srcDir, 'icons'), join(outDir, 'icons'), { recursive: true });
}

const common = {
  bundle: true,
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'linked' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
  },
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'assets/[name]-[hash]',
  outdir: outDir,
};

const builds = [
  // Popup and background run as ES modules.
  { ...common, entryPoints: { popup: join(srcDir, 'src/popup.ts'), background: join(srcDir, 'src/background.ts') }, format: 'esm' },
  // Content scripts cannot be modules.
  { ...common, entryPoints: { content: join(srcDir, 'src/content.ts') }, format: 'iife' },
];

rmSync(outDir, { recursive: true, force: true });
copyStatic();

if (watch) {
  for (const options of builds) await (await context(options)).watch();
  console.log(`\nWatching. Load ${outDir} via chrome://extensions → "Load unpacked".`);
} else {
  await Promise.all(builds.map((options) => build(options)));
  console.log(`\nExtension built: ${outDir}`);
}
