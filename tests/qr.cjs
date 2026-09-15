const assert = require('node:assert/strict');
const path = require('node:path');
const sharp = require('sharp');
const { loadApp } = require('./harness.cjs');
const { assertResult } = require('./result-checks.cjs');
const fixtures = require('./qr-samples.json');

async function main() {
  const root = path.resolve(__dirname, '..');
  const cases = fixtures.samples.filter(sample => sample.id !== 'sample_8')
    .map(sample => ({ ...sample, file: path.join(root, sample.file) }));
  if (process.argv[2]) cases.push({ ...fixtures.samples.find(sample => sample.id === 'sample_8'), file: path.resolve(process.argv[2]) });
  for (const sample of cases) {
    const { data, info } = await sharp(sample.file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const app = loadApp();
    app.sandbox.input = { data, width: info.width, height: info.height };
    const result = app.run('analyzeDocument(input, autoDetectRegion(input))');
    assertResult(result, info, sample.id);
    assert.ok(result.confidence < 100, `${sample.id}: QR heuristic formula is bounded below 100`);
    assert.match(result.mode, /QR/, `${sample.id}: automatic QR path`);
    assert.deepEqual(Array.from(result.digits), sample.digits, `${sample.id}: independently annotated code`);
    for (let pi = 0; pi < 8; pi++) {
      assert.deepEqual([result.zoneBest[pi].cx, result.zoneBest[pi].cy], sample.regressionPoints[pi],
        `${sample.id}: P${pi} historical regression coordinate`);
    }
    console.log(JSON.stringify({ file: path.basename(sample.file), code: result.digits.join(''), score: result.confidence,
      review: result.review, coordinatesPreserved: 8 }));
  }
  console.log(JSON.stringify({ annotatedDigits: cases.length * 8, regressionCoordinates: cases.length * 8,
    note: 'Coordinate fixtures check regressions, not independent point accuracy. Scores are heuristic, not correctness probabilities.' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
