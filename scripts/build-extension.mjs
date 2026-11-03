// Builds the Chrome extension.
//
//   npm run build:extension    production build
//   npm run dev:extension      rebuild on change (unminified, with source maps)
//
// Outputs:
//   dist/extension/                                 load this with "Load unpacked"
//   dist/securevault-<version>-webstore.zip         upload this to the Chrome Web Store
//   public/downloads/securevault-extension.zip      offered on the web app's /extension page
//
// Firebase settings come from .env.local (the same NEXT_PUBLIC_FIREBASE_* values the web app
// uses). NEXT_PUBLIC_APP_URL, if set, is used for "Create account" / "Open web vault" links.

import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFirebaseConfig } from './firebase-env.mjs';
import { zipDirectory } from './zip.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'extension', 'src');
const iconsDir = join(root, 'extension', 'icons');
const outDir = join(root, 'dist', 'extension');
const watch = process.argv.includes('--watch');

const firebaseConfig = loadFirebaseConfig(root);
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version.replace(/-.*$/, '');

for (const size of [16, 32, 48, 128]) {
  if (!existsSync(join(iconsDir, `icon${size}.png`))) {
    console.error(`Missing extension/icons/icon${size}.png. Run "npm run icons".`);
    process.exit(1);
  }
}

function copyStatic() {
  mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(srcDir, 'manifest.json'), 'utf8'));
  manifest.version = version;
  if (appUrl) manifest.homepage_url = appUrl;
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const page of ['popup.html', 'welcome.html']) cpSync(join(srcDir, page), join(outDir, page));
  cpSync(iconsDir, join(outDir, 'icons'), { recursive: true });
}

// The full Firestore SDK needs XMLHttpRequest, which service workers don't have.
// Firestore Lite has the same API for everything src/lib/vault.ts uses and runs on fetch.
const firestoreLite = {
  name: 'firestore-lite',
  setup(b) {
    b.onResolve({ filter: /^firebase\/firestore$/ }, (args) =>
      b.resolve('firebase/firestore/lite', { kind: args.kind, resolveDir: args.resolveDir })
    );
  },
};

const common = {
  bundle: true,
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'linked' : false,
  legalComments: 'none',
  logLevel: 'info',
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser'],
  define: {
    __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
    __APP_URL__: JSON.stringify(appUrl),
    'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
  },
  loader: { '.woff2': 'file', '.woff': 'file' },
  assetNames: 'assets/[name]-[hash]',
  outdir: outDir,
  plugins: [firestoreLite],
};

const builds = [
  {
    ...common,
    entryPoints: {
      background: join(srcDir, 'background.ts'),
      popup: join(srcDir, 'popup.ts'),
      welcome: join(srcDir, 'welcome.ts'),
    },
    format: 'esm',
  },
  // Content scripts cannot be ES modules.
  { ...common, entryPoints: { content: join(srcDir, 'content.ts') }, format: 'iife' },
];

rmSync(outDir, { recursive: true, force: true });
copyStatic();

if (watch) {
  for (const options of builds) await (await context(options)).watch();
  console.log(`\nWatching. Load ${outDir} via chrome://extensions → "Load unpacked".`);
} else {
  await Promise.all(builds.map((options) => build(options)));

  const storeZip = join(root, 'dist', `securevault-${version}-webstore.zip`);
  writeFileSync(storeZip, zipDirectory(outDir)); // Web Store needs manifest.json at the zip root

  const downloadZip = join(root, 'public', 'downloads', 'securevault-extension.zip');
  mkdirSync(dirname(downloadZip), { recursive: true });
  writeFileSync(downloadZip, zipDirectory(outDir, 'securevault-extension'));

  console.log(`\nExtension built:   ${outDir}\nWeb Store package: ${storeZip}\nDownload package:  ${downloadZip}`);
}
