const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

function page(digits, options = {}) {
  const width = 800, height = 1120;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const points = [];
  const put = (x, y, gray = 190) => {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    data[i] = data[i + 1] = data[i + 2] = gray;
  };
  digits.forEach((si, pi) => {
    if (si < 0) { points.push(null); return; }
    const x = (pi % 2 * 4 + si % 4 + 0.5) * 100;
    const y = (Math.floor(pi / 2) * 2 + Math.floor(si / 4) + 0.5) * 140;
    const point = options.skew ? [x * 0.99 + y * 0.008 + 4, y * 1.005 + x * 0.004 - 3] : [x, y];
    points.push(point);
    put(...point, options.gray ?? 190);
  });
  return { data, width, height, points, put };
}

function decode(input) {
  const app = loadApp();
  app.sandbox.input = input;
  return { app, result: app.run('analyzeAnomaly(input, {x:0,y:0,w:input.width,h:input.height})') };
}
const digits = [2, 6, 2, 6, 5, 2, 1, 0];

test('every subcell position, not one memorized code', () => {
  for (let offset = 0; offset < 8; offset++) {
    const expected = digits.map(d => (d + offset) % 8);
    assert.deepEqual(Array.from(decode(page(expected)).result.digits), expected);
  }
});
test('faint, dark, and mildly skewed dots retain their coordinates', () => {
  for (const gray of [45, 180, 210]) {
    const input = page(digits, { gray, skew: true });
    const { result } = decode(input);
    assert.deepEqual(Array.from(result.digits), digits);
    input.points.forEach((p, pi) => assert.ok(Math.hypot(result.zoneBest[pi].cx - p[0], result.zoneBest[pi].cy - p[1]) < 2));
  }
});
test('an off-lattice dust speck cannot replace a faint correct dot', () => {
  const input = page(digits, { gray: 204 });
  input.put(72, 1040, 30);
  assert.deepEqual(Array.from(decode(input).result.digits), digits);
});
test('seven dots do not invent an eighth at the predicted center', () => {
  const expected = [...digits]; expected[3] = -1;
  const { result } = decode(page(expected));
  assert.deepEqual(Array.from(result.digits), expected);
  assert.equal(result.zoneBest[3], null);
  assert.ok(result.review[3]);
  assert.ok(result.confidence <= 87);
});
test('empty, transparent, and line-only inputs are not codes', () => {
  const blank = page(Array(8).fill(-1));
  const transparent = page(Array(8).fill(-1)); transparent.data.fill(0);
  const lines = page(Array(8).fill(-1));
  for (let x = 0; x < 800; x++) for (const y of [70, 350, 630, 910]) lines.put(x, y, 120);
  for (const input of [blank, transparent, lines]) {
    const { result } = decode(input);
    assert.ok(result.digits.every(d => d === -1));
    assert.equal(result.confidence, 0);
  }
});
test('two complete plausible grids remain ambiguous', () => {
  const input = page(Array(8).fill(0));
  for (let pi = 0; pi < 8; pi++) input.put((pi % 2 * 4 + 1.5) * 100, (Math.floor(pi / 2) * 2 + 0.5) * 140);
  const { result } = decode(input);
  assert.ok(result.review.every(Boolean));
});
test('dense random speckles cannot produce an unreviewed confident code', () => {
  const input = page(Array(8).fill(-1));
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 3500; i++) input.put(Math.floor(random() * 800), Math.floor(random() * 1120), 180);
  const { result } = decode(input);
  assert.ok(result.review.some(Boolean));
  assert.ok(result.confidence < 60);
});
test('missing zones and weak isolated noise penalize the score', () => {
  const app = loadApp();
  assert.ok(app.run('calcConfidence([[9000]], [0])') <= 13);
  assert.ok(app.run('calcZoneConfidence([1, 0])') < 0.01);
  assert.equal(app.run('calcZoneConfidence([500, 500])'), 0);
  assert.equal(app.run('calcConfidence([[20, 100]], [0])'), 0);
});
test('region bounds and transparent tiny images', () => {
  const app = loadApp();
  assert.throws(() => app.run('normalizeRegion({x:0,y:0,w:-1,h:1}, 8, 8)'));
  assert.throws(() => app.run('normalizeRegion({x:99,y:99,w:3,h:3}, 8, 8)'));
  assert.deepEqual(JSON.parse(app.run('JSON.stringify(normalizeRegion({x:-5,y:-5,w:10,h:10}, 8, 8))')), { x:0,y:0,w:5,h:5 });
});
test('manual region analysis does not invoke automatic QR alignment', () => {
  const app = loadApp();
  app.sandbox.input = page(digits);
  const result = app.run(`analyzeQRAuto = () => { throw new Error('Unexpected QR override'); };
    analyzeDocument(input, {x:0,y:0,w:800,h:1120}, false);`);
  assert.deepEqual(Array.from(result.digits), digits);
});
test('clearing manual corrections restores missing digits, not zero', () => {
  const app = loadApp();
  app.run('state.scores = Array.from({length:8}, () => Array(8).fill(0)); clearManualMarks();');
  assert.ok(app.run('state.digits.every(d => d === -1)'));
  app.run('state.region = {x:0,y:0,w:800,h:1120}; addManualMark(800,1120);');
  assert.equal(app.run('state.manualMarks.length'), 0);
});
test('invalidation clears all derived state and a queued analysis cannot return', () => {
  const app = loadApp();
  app.sandbox.input = page(digits);
  app.run('state.imageData = input; analyze(); resetAll();');
  app.flush();
  assert.equal(app.run('state.digits'), null);
  assert.equal(app.run('state.autoResult'), null);
  assert.equal(app.nodes.get('copyCodeBtn').disabled, true);
  app.run('state.manualMarks = [{pi:0, si:2}]; state.scores = [[10]]; invalidateResult();');
  assert.equal(app.run('state.manualMarks.length'), 0);
  assert.equal(app.run('state.scores'), null);
});

module.exports = { page };
