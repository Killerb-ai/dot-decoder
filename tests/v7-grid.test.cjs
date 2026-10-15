const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

// A4 비율 합성 용지: 은닉점은 용지 전체 8×8 균등격자의 세부칸 중앙(+인쇄 오프셋)에 찍힌다.
function a4(digits, { width = 1240, offset = [5, 12], rotate180 = false, text = true } = {}) {
  const height = Math.round(width * Math.SQRT2);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dot = (x, y, gray = 40) => {
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      let px = Math.round(x) + dx, py = Math.round(y) + dy;
      if (rotate180) { px = width - 1 - px; py = height - 1 - py; }
      const i = (py * width + px) * 4; data[i] = data[i + 1] = data[i + 2] = gray;
    }
  };
  if (text) { // 본문 흉내: 점과 무관한 굵은 가로 획
    for (let y = 60; y < height - 60; y += 37) for (let x = 80; x < width - 80; x++) if ((x >> 4) % 3) for (let t = 0; t < 4; t += 2) dot(x, y + t, 30);
  }
  digits.forEach((si, pi) => {
    const c = (pi % 2) * 4 + (si % 4), r = Math.floor(pi / 2) * 2 + Math.floor(si / 4);
    const x = (c + 0.5) * width / 8 + offset[0], y = (r + 0.5) * height / 8 + offset[1];
    // 본문 획에 가려지지 않도록 칸 중앙은 비워 둔다
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
      let px = Math.round(x) + dx, py = Math.round(y) + dy;
      if (rotate180) { px = width - 1 - px; py = height - 1 - py; }
      const i = (py * width + px) * 4; data[i] = data[i + 1] = data[i + 2] = 255;
    }
    dot(x, y);
  });
  return { data, width, height };
}
const code = [3, 6, 6, 2, 5, 0, 4, 6];

test('v7.1 page grid decodes without any QR anchor', () => {
  const app = loadApp();
  app.sandbox.input = a4(code);
  const r = app.run('analyzeDocument(input, {x:0,y:0,w:input.width,h:input.height})');
  assert.equal(r.engine, 'v7');
  assert.deepEqual(Array.from(r.digits), code);
  assert.ok(r.review.every(v => v === false));
  assert.ok(r.certainties.every(p => p > 0.9));
});

test('v7.1 reads a page scanned upside down', () => {
  const app = loadApp();
  app.sandbox.input = a4(code, { rotate180: true });
  const r = app.run('analyzeDocument(input, {x:0,y:0,w:input.width,h:input.height})');
  assert.deepEqual(Array.from(r.digits), code);
  assert.equal(r.orient, 180);
});

test('a page without grid dots falls back to the earlier pipelines', () => {
  const app = loadApp();
  app.sandbox.input = a4([], { text: true });
  assert.equal(app.run('analyzeV7Document(input)'), null);
});

test('manual region mode never runs the page grid', () => {
  const app = loadApp();
  app.sandbox.input = a4(code);
  const r = app.run(`analyzeV7Document = () => { throw new Error('page grid must not run'); };
    analyzeDocument(input, {x:0,y:0,w:input.width,h:input.height}, false)`);
  assert.notEqual(r.engine, 'v7');
});
