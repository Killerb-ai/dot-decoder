const { loadApp } = require('./harness.cjs');

async function main() {
  const sharp = require('sharp');
  const app = loadApp();
  for (const filename of process.argv.slice(2)) {
    const { data, info } = await sharp(filename).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    app.sandbox.input = { data, width: info.width, height: info.height };
    if (process.env.DOT_POINTS) {
      app.sandbox.points = JSON.parse(process.env.DOT_POINTS);
      console.log(JSON.stringify(app.run(`(() => {
        const gray = toGrayFloat(input);
        return [170, 205, 215, 230].map(threshold => ({ threshold,
          near: points.map(point => findCompactDarkCandidates(gray, input.width, input.height, threshold, 1, 30)
            .filter(c => Math.hypot(c.cx - point[0], c.cy - point[1]) < 8)) }));
      })()`), null, 2));
      continue;
    }
    const result = app.run(`(() => {
      const region = autoDetectRegion(input);
      const result = analyzeAnomaly(input, region, 100, 88);
      return { size: [input.width, input.height], region, digits: result.digits,
        points: Object.values(result.zoneBest).map(p => p ? [p.cx, p.cy] : null),
        confidence: result.confidence, review: result.review, gridSupport: result.gridSupport,
        gridAmbiguous: result.gridAmbiguous };
    })()`);
    console.log(JSON.stringify({ filename, ...result }, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
