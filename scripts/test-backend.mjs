// Bundles tests/backend.e2e.ts with esbuild and runs it in Node against the live project.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFirebaseConfig } from './firebase-env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'securevault-test-'));
const outfile = join(outDir, 'backend.e2e.cjs');

await build({
  entryPoints: [join(root, 'tests', 'backend.e2e.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'error',
  define: { __FIREBASE_CONFIG__: JSON.stringify(loadFirebaseConfig(root)) },
});

const { status } = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
rmSync(outDir, { recursive: true, force: true });
process.exit(status ?? 1);
