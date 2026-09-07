const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const { loadApp } = require('./harness.cjs');

async function main() {
  const baseline = execFileSync('git', ['show', '4eb0263:index.html'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const cases = [['sample_9(출력본).jpg', '26174411'], ['sample_11(출력본).jpg', '25374411']];
  if (process.argv[2]) cases.push([process.argv[2], '22502270']);
  for (const [file, expected] of cases) {
    const { data, info } = await sharp(path.resolve(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const outputs = [];
    for (const source of [baseline, undefined]) {
      const app = loadApp(source);
      app.sandbox.input = { data, width: info.width, height: info.height };
      outputs.push(app.run(source ? 'analyzeQRAuto(input)' : 'analyzeDocument(input, autoDetectRegion(input))'));
    }
    assert.equal(outputs[0].digits.join(''), expected, `${file}: independently annotated code`);
    assert.deepEqual(Array.from(outputs[1].digits), Array.from(outputs[0].digits), `${file}: QR digits changed`);
    for (let pi = 0; pi < 8; pi++) {
      assert.equal(outputs[1].zoneBest[pi].cx, outputs[0].zoneBest[pi].cx);
      assert.equal(outputs[1].zoneBest[pi].cy, outputs[0].zoneBest[pi].cy);
      assert.ok(outputs[1].cellBest[pi][outputs[1].digits[pi]]);
    }
    console.log(JSON.stringify({ file: path.basename(file), code: expected, score: outputs[1].confidence,
      review: outputs[1].review, coordinatesPreserved: 8 }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
