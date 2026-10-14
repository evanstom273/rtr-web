// Renders public/favicon.svg to the PNG icons the PWA manifest needs.
// Run with: node scripts/make-icons.mjs  (uses Playwright's Chromium)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const out = [
  ['public/pwa-192x192.png', 192, 1],
  ['public/pwa-512x512.png', 512, 1],
  ['public/apple-touch-icon.png', 180, 1],
  // Maskable: shrink the artwork into the central safe zone so launchers can crop to any shape.
  ['public/maskable-512x512.png', 512, 0.72],
];
for (const [file, size, scale] of out) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  await page.setContent(`<html><body style="margin:0;background:#0c0d14;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: file, omitBackground: false });
  console.log('wrote', file);
}
await browser.close();
