const sharp = require('sharp');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');
const { assertResult } = require('./result-checks.cjs');
const sample = require('./samples.json').find(sample => sample.id === 'sample_2');

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node tests/variants.cjs <sample_2-original-path>');
  const original = await sharp(process.argv[2]).metadata();
  const variants = [
    ['original', sharp(process.argv[2]).png()],
    ['2x-nearest', sharp(process.argv[2]).resize({ width: original.width * 2, kernel: 'nearest' }).png()],
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
    assertResult(result, info, name);
    assert.deepEqual(Array.from(result.digits), sample.digits, `${name}: annotated digits`);
    const scaleX = info.width / original.width, scaleY = info.height / original.height;
    for (let pi = 0; pi < 8; pi++) {
      const point = result.zoneBest[pi], expected = sample.points[pi];
      assert.ok(Math.hypot(point.cx / scaleX - expected[0], point.cy / scaleY - expected[1]) <= sample.tolerance,
        `${name}: P${pi} must retain its annotated point, not just its digit`);
    }
    assert.equal(result.review[1], true, `${name}: known competing candidate still needs review`);
    console.log(JSON.stringify({ name, digits: result.digits, matchedPoints: 8,
      review: result.review, score: result.confidence }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
