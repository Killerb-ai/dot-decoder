const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { loadApp } = require('./harness.cjs');
const { createDataset } = require('./synthetic.cjs');
const { assertResult } = require('./result-checks.cjs');

function measure(sample, result) {
  let labeled = 0, correctDigits = 0, located = 0, falsePoints = 0, unsafeZones = 0;
  for (let pi = 0; pi < 8; pi++) {
    const digit = sample.digits[pi], expected = sample.points[pi], point = result.zoneBest[pi];
    const hit = expected && point && result.digits[pi] === digit && Math.hypot(point.cx - expected[0], point.cy - expected[1]) <= sample.tolerance;
    if (digit >= 0 && !sample.ambiguous) {
      labeled++;
      if (result.digits[pi] === digit) correctDigits++;
      if (hit) located++;
    }
    if (digit < 0 && result.digits[pi] >= 0) falsePoints++;
    if (!result.review[pi] && (sample.ambiguous || !hit)) unsafeZones++;
  }
  const eligible = !sample.negative && !sample.ambiguous && sample.digits.every(d => d >= 0);
  const correctCode = eligible && result.digits.every((d, pi) => d === sample.digits[pi]);
  const accepted = result.digits.every(d => d >= 0) && result.review.every(flag => !flag);
  return { labeled, correctDigits, located, falsePoints, unsafeZones, eligible: +eligible,
    correctCode: +correctCode, accepted: +accepted, unsafeDocuments: +(accepted && (!correctCode || located !== 8)) };
}

function summarize(rows) {
  const summary = { images: rows.length };
  for (const key of ['labeled', 'correctDigits', 'located', 'falsePoints', 'unsafeZones', 'eligible', 'correctCode', 'accepted', 'unsafeDocuments']) {
    summary[key] = rows.reduce((sum, row) => sum + row.metrics[key], 0);
  }
  return summary;
}

async function main() {
  const options = Object.fromEntries(process.argv.slice(2).map(arg => {
    const split = arg.indexOf('='); return split < 0 ? [arg.replace(/^--/, ''), true] : [arg.slice(2, split), arg.slice(split + 1)];
  }));
  const split = options.split || 'development';
  const directory = path.resolve(options.directory || `.local-tests/self-validation/${split}`);
  if (options.generate) {
    const manifest = await createDataset(directory, split, Number(options.count || 12));
    console.log(JSON.stringify({ generated: manifest.samples.length, split, directory }));
    if (options['generate-only']) return;
  }
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const source = await fs.readFile(options.source || path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  const rows = [], started = Date.now();
  for (const sample of manifest.samples) {
    const encoded = await fs.readFile(path.join(directory, sample.file));
    if (crypto.createHash('sha256').update(encoded).digest('hex') !== sample.sha256) throw new Error(`Fixture changed: ${sample.id}`);
    const { data, info } = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const app = loadApp(source);
    app.sandbox.input = { data, width: info.width, height: info.height };
    const result = app.run('analyzeDocument(input, autoDetectRegion(input))');
    assertResult(result, info, sample.id);
    const metrics = measure(sample, result);
    rows.push({ id: sample.id, profile: sample.profile, seed: sample.seed, expected: sample.digits,
      predicted: Array.from(result.digits), review: Array.from(result.review), score: result.confidence,
      mode: result.mode, points: Array.from({length:8}, (_,pi) => result.zoneBest[pi] && [result.zoneBest[pi].cx, result.zoneBest[pi].cy]), metrics });
    if (rows.length % manifest.perProfile === 0) console.log(JSON.stringify({ profile: sample.profile, ...summarize(rows.filter(r => r.profile === sample.profile)) }));
  }
  const report = { split: manifest.split, sourceSha256: hash, generatorVersion: manifest.generatorVersion,
    elapsedSeconds: (Date.now() - started) / 1000, totals: summarize(rows),
    profiles: Object.fromEntries([...new Set(rows.map(row => row.profile))].map(profile => [profile, summarize(rows.filter(row => row.profile === profile))])), rows };
  const output = path.resolve(options.output || `.local-tests/self-validation/${split}-results.json`);
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ split, sourceSha256: hash, ...report.totals, elapsedSeconds: report.elapsedSeconds, output }));
}

module.exports = { measure, summarize };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
