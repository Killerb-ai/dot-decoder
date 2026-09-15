const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

function clipboardApp() {
  const app = loadApp();
  let rejectWrite;
  app.sandbox.navigator = { clipboard: { writeText: () => new Promise((resolve, reject) => { rejectWrite = reject; }) } };
  const calls = { appended: 0, copied: 0, removed: 0 };
  app.sandbox.document.body = { appendChild() { calls.appended++; } };
  app.sandbox.document.createElement = () => ({ value: '', style: {}, setAttribute() {}, select() {}, remove() { calls.removed++; } });
  app.sandbox.document.execCommand = () => { calls.copied++; return true; };
  app.run('state.digits = Array(8).fill(0); state.autoResult = {review:Array(8).fill(false), confidence:80}; updateResultDisplay();');
  return { app, calls, reject: () => rejectWrite(new Error('Denied')) };
}

test('delayed clipboard rejection cannot copy a result after reset or correction', async () => {
  for (const action of ['resetAll()', 'state.digits[0] = 1; updateResultDisplay()']) {
    const { app, calls, reject } = clipboardApp();
    const pending = app.run('copyResultCode()');
    app.run(action);
    reject();
    await pending;
    assert.equal(calls.appended, 0);
    assert.equal(calls.copied, 0);
    assert.equal(app.nodes.get('copyCodeBtn').textContent, '복사');
  }
});

test('clipboard fallback succeeds only for the current result and cleans up on failure', async () => {
  for (const failure of [false, 'return', 'throw']) {
    const { app, calls, reject } = clipboardApp();
    if (failure) app.sandbox.document.execCommand = () => {
      calls.copied++;
      if (failure === 'throw') throw new Error('Unavailable');
      return false;
    };
    const pending = app.run('copyResultCode()');
    reject();
    await pending;
    assert.equal(calls.copied, 1);
    assert.equal(calls.removed, 1);
    assert.equal(app.nodes.get('copyCodeBtn').textContent, failure ? '복사' : '복사됨');
    if (failure) assert.match(app.nodes.get('analyzeProgress').textContent, /복사하지 못/);
  }
});

function imageApp() {
  const app = loadApp();
  const images = [];
  app.sandbox.Image = class {
    constructor() { this.naturalWidth = 80; this.naturalHeight = 112; images.push(this); }
  };
  let serial = 0;
  app.sandbox.URL = { createObjectURL: () => `blob:test-${++serial}`, revokeObjectURL() {} };
  app.nodes.get('mainCanvas').getContext().getImageData = () => ({
    data: new Uint8ClampedArray(80 * 112 * 4).fill(255), width: 80, height: 112,
  });
  app.sandbox.document.getElementById('canvasArea').clientWidth = 500;
  return { app, images };
}

test('a valid upload survives invalid manual bounds and can be analyzed after fixing them', () => {
  const { app, images } = imageApp();
  app.run("state.autoDetect = false; document.getElementById('regW').value = '-1'; loadImage({name:'valid.png',size:100})");
  images[0].onload();
  assert.ok(app.run('state.imageData'));
  assert.equal(app.run('state.region'), null);
  assert.equal(app.nodes.get('canvasWrap').style.display, 'inline-block');
  assert.match(app.nodes.get('analyzeProgress').textContent, /영역/);
  assert.equal(app.nodes.get('analyzeBtn').disabled, false);
  for (const [id, value] of Object.entries({ regX: '0', regY: '0', regW: '80', regH: '112' })) app.nodes.get(id).value = value;
  app.nodes.get('regW').listeners.input();
  app.run('analyze()');
  app.flush();
  assert.ok(app.run('state.autoResult.digits.every(d => d === -1)'));
});

test('late image callbacks cannot restore a replaced or reset document', () => {
  const { app, images } = imageApp();
  app.run("loadImage({name:'first.png',size:100}); loadImage({name:'second.png',size:100})");
  images[1].onload();
  assert.equal(app.run('state.image'), images[1]);
  images[0].onload();
  images[0].onerror();
  assert.equal(app.run('state.image'), images[1]);
  app.run("loadImage({name:'third.png',size:100}); resetAll()");
  images[2].onload();
  assert.equal(app.run('state.imageData'), null);
  assert.equal(app.run('state.autoResult'), null);
  assert.equal(app.nodes.get('analyzeBtn').disabled, true);
});
