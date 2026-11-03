// Builds the Chrome extension into dist/extension, and packages it as
// public/downloads/securevault-extension.zip for the web app's /extension page.
//
//   npm run build:extension         production build
//   npm run dev:extension           rebuild on change (unminified, with source maps)
//
// Firebase settings are read from .env.local (the same NEXT_PUBLIC_FIREBASE_* values the
// web app uses) and compiled into the bundle, so there is no separate config file to manage.

import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFirebaseConfig } from './firebase-env.mjs';
import { zipDirectory } from './zip.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'extension');
const outDir = join(root, 'dist', 'extension');
const zipFile = join(root, 'public', 'downloads', 'securevault-extension.zip');
const watch = process.argv.includes('--watch');

const firebaseConfig = loadFirebaseConfig(root);

for (const size of [16, 32, 48, 128]) {
  if (!existsSync(join(srcDir, 'icons', `icon${size}.png`))) {
    console.error(`Missing extension/icons/icon${size}.png. Run "npm run icons".`);
    process.exit(1);
  }
}

function copyStatic() {
  mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(srcDir, 'src', 'manifest.json'), 'utf8'));
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
  mkdirSync(dirname(zipFile), { recursive: true });
  writeFileSync(zipFile, zipDirectory(outDir, 'securevault-extension'));
  console.log(`\nExtension built: ${outDir}\nDownload package: ${zipFile}`);
}
