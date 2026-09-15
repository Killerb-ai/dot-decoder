const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./harness.cjs');

function rotatedApp() {
  const app = loadApp();
  app.run(`
    state.region = {x:0,y:0,w:2483.2,h:3531.12};
    state.imageData = {width:2480,height:3508};
    state.autoResult = {qr:{cx:2396,cy:3427},skew:2,digits:Array(8).fill(-1),review:Array(8).fill(true)};
    state.digits = Array(8).fill(-1);
    state.cellBest = Array.from({length:8},()=>Array(8).fill(null));
    state.cellBest[0][0] = {cx:383.217787682323,cy:147.7572877602429,pi:0,si:0,score:1};
    state.selectedSubzone = {pi:0,si:0};
  `);
  return app;
}

test('confirming a rotated QR candidate preserves the selected subcell', () => {
  const app = rotatedApp();
  app.nodes.get('confirmSubzoneBtn').listeners.click();
  assert.deepEqual(Array.from(app.run('state.digits')), [0,-1,-1,-1,-1,-1,-1,-1]);
  assert.equal(app.run('state.manualMarks[0].cx'), 383.217787682323);
});

test('a raw image click uses the deskewed QR grid, with image bounds checked', () => {
  const app = rotatedApp();
  app.run('addManualMark(383.217787682323,147.7572877602429)');
  assert.equal(app.run('state.digits[0]'), 0);
  app.run('state.manualMarks=[]; state.region.x=-100; addManualMark(-10,100);');
  assert.equal(app.run('state.manualMarks.length'), 0);
});

test('QR image/grid transforms round trip in both skew directions', () => {
  const app = rotatedApp();
  for (const skew of [-2, 0, 2]) {
    app.sandbox.angle = skew;
    assert.ok(app.run(`state.autoResult.skew=angle;
      (()=>{const p=mapGridPoint(270,220,true),q=mapGridPoint(p.x,p.y);
        return Math.hypot(q.x-270,q.y-220)<1e-9;})()`));
  }
});

function qrAnalysis({ weak = false, competingPoint = false, scale = 1 } = {}) {
  const app = loadApp();
  app.sandbox.options = { weak, competingPoint, scale };
  return app.run(`
    detectQRCenterV61=()=>({cx:2396,cy:3427});
    toGrayFloat=()=>new Float32Array(2480*3508);
    boxBlurI=x=>x;
    estimateSkewV61=()=>0;
    runLengthLines=x=>x;
    integral=()=>[];
    detectDotsV61=(a,b,c,w,h,threshold)=>{
      if(threshold===38)return [];
      const points=Array.from({length:8},(_,pi)=>({
        cx:19+((pi%2)*4+0.5)*310.4*options.scale,
        cy:-4+(Math.floor(pi/2)*2+0.5)*441.39*options.scale,
        area:options.weak&&pi===7?4:14,cont:options.weak&&pi===7?61:180,
        dim:options.weak&&pi===7?2:4,rd:0,rd2:0}));
      if(options.competingPoint)points.push({...points[0],cx:points[0].cx+8});
      return points;
    };
    analyzeDocument({width:2480,height:3508,data:[]},{x:0,y:0,w:2480,h:3508});
  `);
}

test('a weak QR candidate cannot gain full certainty just by being alone', () => {
  const result = qrAnalysis({ weak: true });
  assert.equal(result.alignmentReliable, true);
  assert.ok(result.zoneBest[7].score < 0.1);
  assert.ok(result.certainties[7] < 0.6);
  assert.equal(result.review[7], true);
  assert.ok(result.certainties.every(value => value < 1));
  assert.ok(result.confidence < 60);
});

test('separate comparable QR points in one subcell require coordinate review', () => {
  const result = qrAnalysis({ competingPoint: true });
  assert.equal(result.digits[0], 0);
  assert.ok(result.zoneBest[0].coordinateMargin < 0.25);
  assert.equal(result.review[0], true);
});

test('QR fitting at its allowed scale limit marks every zone for review', () => {
  const result = qrAnalysis({ scale: 1.03 });
  assert.equal(result.alignmentReliable, false);
  assert.ok(result.review.every(Boolean));
});

test('native QR geometry remains supported with fractional certainty', () => {
  const result = qrAnalysis();
  assert.equal(result.alignmentReliable, true);
  assert.ok(result.review.every(value => value === false));
  assert.ok(result.certainties.every(value => value > 0.9 && value < 1));
});
