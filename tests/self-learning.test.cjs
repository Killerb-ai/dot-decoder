const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

function fixture(seed, gray = 238, count = 8) {
  let value = seed;
  const rnd = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
  const width = 800, height = 1120;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const digits = Array.from({length:8}, (_,pi) => pi < count ? Math.floor(rnd() * 8) : -1);
  const points = digits.map((digit, pi) => {
    if (digit < 0) return null;
    const x = (pi % 2 * 4 + digit % 4 + 0.5) * 100;
    const y = (Math.floor(pi / 2) * 2 + Math.floor(digit / 4) + 0.5) * 140;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = gray;
    return [x, y];
  });
  return { data, width, height, digits, points };
}

test('very faint random codes retain real coordinates and remain under review', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const app = loadApp(), input = fixture(seed * 929, 231 + seed % 10);
    app.sandbox.input = input;
    const result = app.run('analyzeAnomaly(input,{x:0,y:0,w:800,h:1120})');
    assert.deepEqual(Array.from(result.digits), input.digits);
    input.points.forEach((point, pi) => assert.deepEqual([result.zoneBest[pi].cx, result.zoneBest[pi].cy], point));
    assert.ok(result.review.every(Boolean));
  }
});

test('three isolated dark dots cannot be presented as verified grid evidence', () => {
  const app = loadApp();
  app.sandbox.input = fixture(771, 60, 3);
  const result = app.run('analyzeAnomaly(input,{x:0,y:0,w:800,h:1120})');
  assert.equal(result.mode, '개별 후보');
  assert.ok(result.review.every(Boolean));
  assert.ok(result.digits.slice(3).every(d => d === -1));
});

function nearbyGrid(extra) {
  const app = loadApp();
  app.sandbox.extra = extra;
  app.run(`
    const matches = Array.from({length:8}, (_,pi) => {
      const u=pi%2*4+0.5,v=Math.floor(pi/2)*2+0.5;
      return {pi,si:0,u,v,nx:u,ny:v,cx:u*100,cy:v*140,quality:0.8,merit:0.8,residual:0,contrast:100};
    });
    const cells=Array.from({length:64},()=>[]);
    matches.forEach(p=>cells[p.pi*8].push(p));
    cells[0]=extra.map(dx=>({...matches[0],cx:50+dx,nx:0.5+dx/100}));
    matches[0]=null;
    const selected={digits:Array(8).fill(0),scores:Array(8),zoneBest:{},sources:[],certainties:[]};
    applyGridConsensus(selected,{matches,cells,model:{x:[1,0,0],y:[0,1,0]},count:7,ambiguous:Array(8).fill(false)},
      {x:0,y:0,w:800,h:1120});
  `);
  return app;
}

test('one slightly displaced component can be recovered with capped certainty', () => {
  const app = nearbyGrid([6]);
  assert.equal(app.run('selected.digits[0]'), 0);
  assert.equal(app.run('selected.zoneBest[0].cx'), 56);
  assert.equal(app.run('selected.sources[0]'), 'grid-nearby');
  assert.ok(app.run('selected.certainties[0]') <= 0.35);
  assert.equal(app.run('selected.gridSupport'), 7);
});

test('nearby recovery rejects absent, distant, or competing physical components', () => {
  for (const points of [[], [20], [5, 8]]) {
    const app = nearbyGrid(points);
    assert.equal(app.run('selected.digits[0]'), -1);
    assert.equal(app.run('selected.zoneBest[0]'), null);
  }
});

test('separate points in the same subcell do not silently confirm a coordinate', () => {
  const app = loadApp(), input = fixture(512, 120);
  const [x,y] = input.points[0];
  for (const dx of [-2,0,2]) {
    const i=(y*input.width+x+dx)*4;
    input.data[i]=input.data[i+1]=input.data[i+2]=dx===0?255:120;
  }
  app.sandbox.input=input;
  const result=app.run('analyzeAnomaly(input,{x:0,y:0,w:800,h:1120})');
  assert.equal(result.digits[0],input.digits[0]);
  assert.equal(result.review[0],true);
});
