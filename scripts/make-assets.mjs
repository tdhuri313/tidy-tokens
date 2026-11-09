// Builds the Figma Community listing images:
//   assets/icon.svg                         -> assets/icon.png (128 x 128), assets/icon-512.png (512 x 512)
//   assets/raw/before.png + assets/raw/after.png -> assets/cover.png (1920 x 1080)
// Run with: npm run assets

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");

const LAVENDER = "#E6E3FF";
const NAVY = "#1B1F5E";
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif";

// ---- Icon ----

async function makeIcon() {
  const svg = await readFile(join(ASSETS, "icon.svg"));
  // The SVG is 512 wide, so it rasterizes at 512 px. The small icon is scaled down from that for smooth edges.
  const big = await sharp(svg).resize(512, 512).png().toBuffer();
  await sharp(big).toFile(join(ASSETS, "icon-512.png"));
  await sharp(big).resize(128, 128).png().toFile(join(ASSETS, "icon.png"));
}

// ---- Cover ----

const COVER = { width: 1920, height: 1080 };

// Each screenshot is scaled to fit inside a box this size. With the gap, two full-width shots
// span x 130 to 1790, inset from the 80px margin so the soft shadow (about 45px of blur plus
// a 12px drop) also stays inside it. Shots are top-aligned at TOP so the labels line up.
const BOX = { width: 770, height: 560 };
const TOP = 380;
const GAP = 120; // space between the shots, where the arrow goes
const RADIUS = 24;
const ARROW_LENGTH = 70;

// Scales an image to fit the box (keeping its shape) and rounds its corners
async function prepareScreenshot(file) {
  const { width, height } = await sharp(file).metadata();
  const scale = Math.min(BOX.width / width, BOX.height / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  // Cut the corners off with a rounded-rectangle mask
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${RADIUS}" fill="#fff"/></svg>`,
  );
  const image = await sharp(file)
    .resize(w, h, { fit: "fill" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  return { image, w, h };
}

// Centers the pair horizontally with GAP between them, and puts the arrow in the middle of the gap
function layout(before, after) {
  const left = Math.round((COVER.width - (before.w + GAP + after.w)) / 2);
  const placedBefore = { ...before, x: left, y: TOP };
  const placedAfter = { ...after, x: left + before.w + GAP, y: TOP };
  const middle = left + before.w + GAP / 2;
  const arrow = {
    x1: middle - ARROW_LENGTH / 2,
    x2: middle + ARROW_LENGTH / 2,
    y: TOP + Math.round(Math.min(before.h, after.h) / 2), // centered on the shorter shot, so it never floats below it
  };
  return { before: placedBefore, after: placedAfter, arrow };
}

// Shadow and white backing under a screenshot, plus its label above it
function frameSvg(shot, label) {
  return `
    <rect x="${shot.x}" y="${shot.y + 12}" width="${shot.w}" height="${shot.h}" rx="${RADIUS}"
      fill="${NAVY}" fill-opacity="0.22" filter="url(#shadow)"/>
    <rect x="${shot.x}" y="${shot.y}" width="${shot.w}" height="${shot.h}" rx="${RADIUS}" fill="#fff"/>
    <text x="${shot.x + shot.w / 2}" y="${shot.y - 24}" text-anchor="middle"
      font-family="${FONT}" font-size="40" font-weight="700" fill="${NAVY}">${label}</text>`;
}

function backgroundSvg({ before, after, arrow }) {
  const { x1, x2, y } = arrow;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${COVER.width}" height="${COVER.height}">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="15"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="${LAVENDER}"/>

    <text x="80" y="170" font-family="${FONT}" font-size="104" font-weight="800" fill="${NAVY}">Tidy Tokens</text>
    <text x="82" y="236" font-family="${FONT}" font-size="40" font-weight="500" fill="${NAVY}">Find and fix design-system drift in one click.</text>

    ${frameSvg(before, "Before")}
    ${frameSvg(after, "After")}

    <g stroke="${NAVY}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
      <polyline points="${x2 - 26},${y - 26} ${x2},${y} ${x2 - 26},${y + 26}"/>
    </g>
  </svg>`);
}

async function makeCover() {
  const files = { before: join(ASSETS, "raw", "before.png"), after: join(ASSETS, "raw", "after.png") };
  const missing = Object.values(files).filter((file) => !existsSync(file));
  if (missing.length > 0) throw new Error(`Missing screenshot(s): ${missing.join(", ")}`);

  const placed = layout(await prepareScreenshot(files.before), await prepareScreenshot(files.after));
  const { before, after } = placed;
  await sharp(backgroundSvg(placed))
    .composite([
      { input: before.image, left: before.x, top: before.y },
      { input: after.image, left: after.x, top: after.y },
    ])
    .png()
    .toFile(join(ASSETS, "cover.png"));
}

await makeIcon();
console.log("Wrote assets/icon.png and assets/icon-512.png");
await makeCover();
console.log("Wrote assets/cover.png");
