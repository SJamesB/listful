const sharp = require('sharp');
const path = require('path');

const IMAGES = path.join(__dirname, '..', 'assets', 'images');
const SOURCE = path.join(IMAGES, 'icon-source.png');

// The source export is a 1024x1024 rounded-square tile (transparent corners).
// This crop sits inside the rounded corners so the result is a flat,
// full-bleed square — the OS applies its own icon mask on top.
const CROP = { left: 288, top: 265, width: 448, height: 448 };

function baseIcon(size) {
  return sharp(SOURCE).extract(CROP).resize(size, size);
}

// Isolate the "!" + heart "L" mark by flood-filling the gradient background
// (everything reachable from the canvas border that isn't a near-black
// outline pixel). What's left — the outline plus the white fill it encloses
// — is the glyph silhouette.
async function glyphAlpha(size) {
  const { data, info } = await baseIcon(size).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const isDark = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    isDark[p] = Math.max(data[i], data[i + 1], data[i + 2]) < 70 ? 1 : 0;
  }
  const isBg = new Uint8Array(width * height);
  const stack = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (isBg[idx] || isDark[idx]) return;
    isBg[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width, y = (idx / width) | 0;
    visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1);
  }
  return { data, info, isBg };
}

// Bounding box of the connected glyph region containing the canvas centre
// (avoids stray edge pixels from the flood fill).
function glyphBBox({ info, isBg }) {
  const { width, height } = info;
  const isGlyph = (x, y) => !isBg[y * width + x];
  const visited = new Uint8Array(width * height);
  const stack = [[width >> 1, height >> 1]];
  let minX = width, maxX = 0, minY = height, maxY = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx] || !isGlyph(x, y)) continue;
    visited[idx] = 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Render the glyph (cropped to its bbox) at `targetWidth`, either as a flat
// `color` silhouette or in its original black-outline/white-fill colours.
async function glyphImage(size, targetWidth, color) {
  const mask = await glyphAlpha(size);
  const bbox = glyphBBox(mask);
  const { data, info } = mask;
  const out = Buffer.alloc(bbox.width * bbox.height * 4);
  for (let y = 0; y < bbox.height; y++) {
    for (let x = 0; x < bbox.width; x++) {
      const sx = bbox.left + x, sy = bbox.top + y;
      const si = (sy * info.width + sx) * info.channels;
      const di = (y * bbox.width + x) * 4;
      const opaque = !mask.isBg[sy * info.width + sx];
      if (color) {
        out[di] = color[0]; out[di + 1] = color[1]; out[di + 2] = color[2];
      } else {
        out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2];
      }
      out[di + 3] = opaque ? 255 : 0;
    }
  }
  const targetHeight = Math.round((targetWidth * bbox.height) / bbox.width);
  return sharp(out, { raw: { width: bbox.width, height: bbox.height, channels: 4 } })
    .resize(targetWidth, targetHeight);
}

async function run() {
  await baseIcon(1024).png().toFile(path.join(IMAGES, 'icon.png'));
  console.log('icon.png');

  await baseIcon(1024).png().toFile(path.join(IMAGES, 'android-icon-foreground.png'));
  console.log('android-icon-foreground.png');

  await baseIcon(512).png().toFile(path.join(IMAGES, 'android-icon-background.png'));
  console.log('android-icon-background.png');

  // Monochrome (Android 13+ themed icon): white silhouette on transparent,
  // centred in the safe zone of a 432x432 canvas.
  const monoGlyph = await (await glyphImage(1024, 200, [255, 255, 255])).png().toBuffer();
  const monoMeta = await sharp(monoGlyph).metadata();
  await sharp({ create: { width: 432, height: 432, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: monoGlyph, left: Math.round((432 - monoMeta.width) / 2), top: Math.round((432 - monoMeta.height) / 2) }])
    .png()
    .toFile(path.join(IMAGES, 'android-icon-monochrome.png'));
  console.log('android-icon-monochrome.png');

  // Splash logo: glyph in its original colours, transparent background.
  await (await glyphImage(1024, 228)).png().toFile(path.join(IMAGES, 'splash-icon.png'));
  console.log('splash-icon.png');

  // Favicon: the full rounded-square tile (with transparent corners) at
  // browser-tab size.
  await sharp(SOURCE).resize(48, 48).png().toFile(path.join(IMAGES, 'favicon.png'));
  console.log('favicon.png');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
