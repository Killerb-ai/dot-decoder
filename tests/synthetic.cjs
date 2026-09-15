const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const PROFILES = ['clean', 'faint', 'affine', 'gradient', 'dust', 'text', 'jpeg', 'blur',
  'resize', 'jitter', 'missing', 'overlap', 'blank', 'noise-only', 'text-only', 'ambiguous'];

function random(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

// Ground truth comes from the encoder's chosen digits and drawn coordinates.
// This module never imports the decoder or derives labels from its predictions.
async function generate(profile, seed) {
  const rnd = random(seed), between = (lo, hi) => lo + rnd() * (hi - lo);
  const width = 640 + Math.floor(rnd() * 17), height = 896 + Math.floor(rnd() * 17);
  const data = Buffer.alloc(width * height * 4, 255);
  const background = profile === 'gradient' ? between(208, 228) : 255;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gray = Math.round(background + (255 - background) * (0.65 * x / width + 0.35 * y / height));
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  const put = (x, y, gray) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = Math.min(data[i], Math.round(gray));
  };
  const line = (x0, y0, x1, y1, gray) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) put(x0 + (x1 - x0) * i / Math.max(1, steps), y0 + (y1 - y0) * i / Math.max(1, steps), gray);
  };
  // An ordinary page frame fixes the insertion region independently of dot positions.
  if (profile !== 'blank') {
    line(10, 10, width - 11, 10, 100); line(10, height - 11, width - 11, height - 11, 100);
    line(10, 10, 10, height - 11, 100); line(width - 11, 10, width - 11, height - 11, 100);
  }
  if (['text', 'text-only', 'overlap'].includes(profile)) {
    for (let row = 0; row < 20; row++) {
      const y = 30 + row * 39 + Math.floor(between(-5, 5));
      for (let col = 0; col < 35; col++) {
        const x = 28 + col * 16;
        // Joined five-by-seven stroke glyphs, plus occasional punctuation.
        line(x, y, x, y + 9, 90); line(x, y, x + 6, y, 90);
        line(x + 6, y, x + 6, y + 9, 90);
        if (rnd() < 0.7) line(x, y + 4, x + 6, y + 4, 90);
        if (rnd() < 0.15) put(x + 10, y + 9, 100);
      }
    }
    for (let row = 1; row <= 5; row++) line(25, row * 140, width - 26, row * 140, 120);
  }
  if (['dust', 'noise-only'].includes(profile)) {
    for (let i = 0; i < 100 + Math.floor(rnd() * 100); i++) put(between(15, width - 16), between(15, height - 16), between(60, 232));
  }
  const negative = ['blank', 'noise-only', 'text-only'].includes(profile);
  const digits = Array.from({ length: 8 }, () => negative ? -1 : Math.floor(rnd() * 8));
  if (profile === 'missing') {
    const missing = new Set();
    while (missing.size < 1 + seed % 3) missing.add(Math.floor(rnd() * 8));
    for (const pi of missing) digits[pi] = -1;
  }
  const angle = profile === 'affine' ? between(-1.5, 1.5) * Math.PI / 180 : 0;
  const offsetX = profile === 'affine' ? between(-4, 4) : 0;
  const offsetY = profile === 'affine' ? between(-4, 4) : 0;
  const points = Array(8).fill(null);
  const paintDot = (si, pi, gray) => {
    let x = (pi % 2 * 4 + si % 4 + 0.5) * width / 8;
    let y = (Math.floor(pi / 2) * 2 + Math.floor(si / 4) + 0.5) * height / 8;
    const dx = x - width / 2, dy = y - height / 2;
    x = width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy + offsetX;
    y = height / 2 + Math.sin(angle) * dx + Math.cos(angle) * dy + offsetY;
    if (profile === 'jitter') { x += between(-6, 6); y += between(-6, 6); }
    x = Math.round(x); y = Math.round(y);
    const radius = ['blur', 'jpeg'].includes(profile) ? 1 : rnd() < 0.35 ? 1 : 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) put(x + dx, y + dy, gray);
    }
    return [x, y];
  };
  for (let pi = 0; pi < 8; pi++) {
    if (digits[pi] < 0) continue;
    const gray = profile === 'faint' ? between(218, 243) : profile === 'gradient' ? between(177, 206) : between(70, 204);
    points[pi] = paintDot(digits[pi], pi, gray);
    if (profile === 'overlap' && pi % 3 === 0) {
      const [x, y] = points[pi]; line(x - 8, y, x + 8, y, 80);
    }
  }
  if (profile === 'ambiguous') {
    for (let pi = 0; pi < 8; pi++) paintDot((digits[pi] + 1 + Math.floor(rnd() * 7)) % 8, pi, 120);
  }
  let pipeline = sharp(data, { raw: { width, height, channels: 4 } });
  const parameters = { angleDegrees: angle * 180 / Math.PI, background };
  if (profile === 'blur') { parameters.sigma = between(0.3, 0.8); pipeline = pipeline.blur(parameters.sigma); }
  if (profile === 'resize') { parameters.width = Math.round(width * between(0.6, 1.6)); pipeline = pipeline.resize({ width: parameters.width }); }
  const jpeg = profile === 'jpeg';
  if (jpeg) { parameters.quality = Math.floor(between(55, 91)); pipeline = pipeline.jpeg({ quality: parameters.quality }); }
  else pipeline = pipeline.png();
  const encoded = await pipeline.toBuffer();
  const info = await sharp(encoded).metadata();
  const sx = info.width / width, sy = info.height / height;
  const finalPoints = points.map(p => p && [(p[0] + 0.5) * sx - 0.5, (p[1] + 0.5) * sy - 0.5]);
  return { encoded, extension: jpeg ? 'jpg' : 'png', metadata: {
    profile, seed, width: info.width, height: info.height, digits, points: finalPoints,
    tolerance: Math.max(2, sx * 2), negative, ambiguous: profile === 'ambiguous', parameters,
    sha256: crypto.createHash('sha256').update(encoded).digest('hex'),
  } };
}

async function createDataset(directory, split, perProfile = 12) {
  if (!['development', 'holdout'].includes(split)) throw new Error('Unknown split');
  await fs.mkdir(directory, { recursive: true });
  const samples = [];
  const baseSeed = split === 'development' ? 902101 : 71829011;
  for (let p = 0; p < PROFILES.length; p++) for (let i = 0; i < perProfile; i++) {
    const sample = await generate(PROFILES[p], baseSeed + p * 10007 + i * 131);
    const id = `${PROFILES[p]}-${String(i).padStart(3, '0')}`;
    const file = `${id}.${sample.extension}`;
    await fs.writeFile(path.join(directory, file), sample.encoded);
    samples.push({ id, file, ...sample.metadata });
  }
  const manifest = { generatorVersion: 1, split, baseSeed, perProfile, samples,
    labelSource: 'Seeded independent pixel encoder; no decoder predictions used as labels.' };
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { PROFILES, generate, createDataset };
