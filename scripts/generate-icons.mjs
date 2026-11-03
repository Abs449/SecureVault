// Renders assets/logo.svg into the PNG sizes Chrome needs. Run with `npm run icons`
// after changing the logo; the PNGs are committed so builds don't need this step.

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets', 'logo.svg'), 'utf8');

const targets = [
  ...[16, 32, 48, 128].map((size) => ({ size, file: join(root, 'extension', 'icons', `icon${size}.png`) })),
  { size: 180, file: join(root, 'public', 'apple-touch-icon.png') },
];

for (const { size, file } of targets) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(file, png);
  console.log(`wrote ${file.replace(root, '.')} (${size}px)`);
}
