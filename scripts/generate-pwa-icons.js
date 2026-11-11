// Generates the web app (PWA) icons in public/ from assets/images/icon.png.
// Re-run after changing the app icon: node scripts/generate-pwa-icons.js
/* global __dirname, Buffer */
const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'images', 'icon.png'); // full-bleed 1024x1024
const PUBLIC = path.join(ROOT, 'public');

// "any" icons are shown as-is (desktop installs, some launchers), so give them
// rounded corners. Maskable and Apple icons stay full-bleed: the OS crops them.
function rounded(size) {
  const r = Math.round(size * 0.22);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  );
  return sharp(SOURCE).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png();
}

async function run() {
  const outputs = [
    ['icon-192.png', rounded(192)],
    ['icon-512.png', rounded(512)],
    ['icon-maskable-512.png', sharp(SOURCE).resize(512, 512).png()],
    ['apple-touch-icon.png', sharp(SOURCE).resize(180, 180).flatten({ background: '#ffffff' }).png()],
  ];
  for (const [name, img] of outputs) {
    await img.toFile(path.join(PUBLIC, name));
    console.log(`public/${name}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
