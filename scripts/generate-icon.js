const sharp = require('sharp');
const path = require('path');

const SIZE = 1024;

// The "l" is drawn as a single thick stroke path — round linecaps automatically
// give the bubbly top and flick tip without any extra shapes.
//
// Stem: vertical line, top at (420, 190), bottom merges into the flick curve.
// Flick: quadratic bezier that sweeps right, dips slightly, then curves
//        back UP dramatically — matching the reference bubble-letter style.

const STROKE = 168;       // stroke width → controls how "fat" the letter is
const SX  = 418;          // x centre of the stem
const ST  = 195;          // y top of stem
const SB  = 762;          // y bottom of stem (start of flick)
const FCX = 610;          // flick control-point x (pulls the curve outward)
const FCY = 840;          // flick control-point y (dips below baseline)
const FEX = 672;          // flick end x
const FEY = 590;          // flick end y  (tip is notably HIGHER than the stem bottom)

const D = `M ${SX},${ST} L ${SX},${SB} Q ${FCX},${FCY} ${FEX},${FEY}`;

function lLayer(strokeWidth, opacity, filter) {
  const f = filter ? `filter="url(#${filter})"` : '';
  return `<path d="${D}"
    stroke="white" stroke-width="${strokeWidth}" stroke-linecap="round"
    stroke-linejoin="round" fill="none"
    opacity="${opacity}" ${f}/>`;
}

function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#F0BFFF"/>
      <stop offset="33%"  stop-color="#BFCFFF"/>
      <stop offset="66%"  stop-color="#BFFFEC"/>
      <stop offset="100%" stop-color="#F0BFFF"/>
    </linearGradient>
    <linearGradient id="warm" x1="1" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%"   stop-color="#FFD4B8" stop-opacity="0.55"/>
      <stop offset="60%"  stop-color="#FFFBB8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-20%" width="200%" height="140%">
      <feGaussianBlur stdDeviation="28" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <filter id="shadow" x="-30%" y="-10%" width="160%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="18"
        flood-color="#5020A0" flood-opacity="0.28"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#warm)"/>

  <!-- Soft glow halo -->
  ${lLayer(STROKE + 80, 0.22, 'glow')}

  <!-- The "l" -->
  ${lLayer(STROKE, 0.97, 'shadow')}
</svg>`;
}

function foregroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <filter id="shadow" x="-30%" y="-10%" width="160%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="18"
        flood-color="#5020A0" flood-opacity="0.30"/>
    </filter>
  </defs>
  ${lLayer(STROKE, 0.97, 'shadow')}
</svg>`;
}

async function run() {
  const outDir = path.join(__dirname, '..', 'assets', 'images');

  await sharp(Buffer.from(iconSvg())).png()
    .toFile(path.join(outDir, 'icon.png'));
  console.log('✓ icon.png');

  await sharp(Buffer.from(foregroundSvg())).png()
    .toFile(path.join(outDir, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png');

  await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: '#D4A8FF' } })
    .png().toFile(path.join(outDir, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png');
}

run().catch(console.error);
