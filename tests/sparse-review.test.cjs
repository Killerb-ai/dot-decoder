const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

function decodePoints(points, width = 81, height = 113) {
  const app = loadApp();
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y, gray = 0] of points) {
    const index = (y * width + x) * 4;
    data[index] = data[index + 1] = data[index + 2] = gray;
  }
  app.sandbox.input = { data, width, height };
  return app.run('analyzeAnomaly(input, {x:0,y:0,w:input.width,h:input.height})');
}

test('four dots on fractional primary-column boundaries cannot become an eight-digit code', () => {
  const result = decodePoints([[40, 7], [40, 35], [40, 63], [40, 91]]);
  assert.deepEqual(Array.from(result.digits), [3, -1, 3, -1, 3, -1, 3, -1]);
  assert.ok([1, 3, 5, 7].every(pi => result.review[pi] && result.zoneBest[pi] === null));
  const points = Object.values(result.zoneBest).filter(Boolean);
  assert.equal(new Set(points.map(p => `${p.cx},${p.cy}`)).size, points.length);
});

test('a dot at intersecting fractional boundaries belongs to one primary zone', () => {
  const result = decodePoints([[40, 28], [40, 84]]);
  assert.deepEqual(Array.from(result.digits), [7, -1, -1, -1, 7, -1, -1, -1]);
  assert.equal(Object.values(result.zoneBest).filter(Boolean).length, 2);
  assert.ok(result.confidence <= 25);
});

test('a clear six-zone competing lattice keeps its differing digits under review', () => {
  const points = [];
  for (let pi = 0; pi < 8; pi++) {
    const x = (pi % 2 * 4 + 0.5) * 100;
    const y = (Math.floor(pi / 2) * 2 + 0.5) * 140;
    points.push([x, y, 50]);
    if (pi < 6) points.push([x + 112, y + 12, 50]);
  }
  const result = decodePoints(points, 800, 1120);
  assert.deepEqual(Array.from(result.digits), Array(8).fill(0));
  assert.deepEqual(Array.from(result.review), [true, true, true, true, true, true, false, false]);
  assert.ok(result.confidence < 60);
});

test('inspection retains the accepted lattice point when a stronger same-cell point lies outside the fit', () => {
  const app = loadApp();
  app.run(`
    const matches = Array.from({length:8}, (_,pi) => {
      const u = pi % 2 * 4 + 0.5, v = Math.floor(pi / 2) * 2 + 0.5;
      return {pi,si:0,u,v,nx:u,ny:v,cx:u*100,cy:v*140,quality:0.2,merit:0.2,residual:0,contrast:30};
    });
    const cells = Array.from({length:64}, () => []);
    matches.forEach(p => cells[p.pi * 8].push(p));
    cells[0].push({...matches[0],cx:54,nx:0.54,quality:1});
    const selected = {digits:Array(8).fill(0),scores:Array(8),zoneBest:{},sources:[],certainties:[]};
    applyGridConsensus(selected, {matches,cells,model:{x:[1,0,0],y:[0,1,0]},count:8,ambiguous:Array(8).fill(false)},
      {x:0,y:0,w:800,h:1120});
  `);
  assert.equal(app.run('selected.zoneBest[0].cx'), 50);
  assert.equal(app.run('selected.cellBest[0][0].cx'), 50);
  assert.equal(app.run('selected.cellBest[0][0].score'), app.run('selected.scores[0][0]'));
});
