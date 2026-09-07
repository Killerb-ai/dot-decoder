const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const { loadApp } = require('./harness.cjs');
const samples = require('./samples.json');

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node tests/samples.cjs <private-sample-directory> [--baseline=<git-ref>]');
  const ref = process.argv.find(arg => arg.startsWith('--baseline='))?.split('=')[1];
  const baseline = ref ? execFileSync('git', ['show', `${ref}:index.html`], { encoding: 'utf8' }) : undefined;
  let total = 0, correct = 0, located = 0;
  for (const sample of samples) {
    const { data, info } = await sharp(path.join(root, sample.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const app = loadApp(baseline);
    app.sandbox.input = { data, width: info.width, height: info.height };
    const result = app.run('analyzeAnomaly(input, autoDetectRegion(input), 100, 88)');
    let matchedDigits = 0, matchedPoints = 0, labeled = 0;
    const misses = [];
    for (let pi = 0; pi < 8; pi++) {
      if (sample.digits[pi] === null) continue;
      labeled++;
      if (result.digits[pi] === sample.digits[pi]) matchedDigits++;
      const p = result.zoneBest[pi], expected = sample.points[pi];
      if (result.digits[pi] === sample.digits[pi] && p && Math.hypot(p.cx - expected[0], p.cy - expected[1]) <= sample.tolerance) matchedPoints++;
      else misses.push(`P${pi}`);
    }
    total += labeled; correct += matchedDigits; located += matchedPoints;
    console.log(JSON.stringify({ sample: sample.id, code: result.digits.map(d => d < 0 ? '?' : d).join(''),
      labeled, matchedDigits, matchedPoints, misses, review: result.review, score: result.confidence }));
    if (!baseline) assert.ok(matchedPoints >= sample.minimumLocated, `${sample.id} regressed below its recorded baseline`);
  }
  console.log(JSON.stringify({ totalLabels: total, correctDigits: correct, locatedPoints: located,
    note: 'Known misses remain failures in these metrics; minimumLocated is only a regression floor.' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
