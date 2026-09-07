const sharp = require('sharp');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node tests/variants.cjs <sample_2-original-path>');
  const variants = [
    ['original', sharp(process.argv[2]).png()],
    ['2x-nearest', sharp(process.argv[2]).resize({ width: 1586, kernel: 'nearest' }).png()],
    ['brighter', sharp(process.argv[2]).linear(1, 5).png()],
    ['darker', sharp(process.argv[2]).linear(1, -12).png()],
    ['jpeg-90', sharp(process.argv[2]).jpeg({ quality: 90 })],
  ];
  for (const [name, pipeline] of variants) {
    const encoded = await pipeline.toBuffer();
    const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const app = loadApp();
    app.sandbox.input = { data, width: info.width, height: info.height };
    const result = app.run('analyzeAnomaly(input, autoDetectRegion(input))');
    console.log(JSON.stringify({ name, digits: result.digits, review: result.review, score: result.confidence }));
    assert.equal(result.digits.join(''), '26265210', name);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
