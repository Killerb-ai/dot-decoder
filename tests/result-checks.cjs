const assert = require('node:assert/strict');

// Check invariants shared by the sparse and QR decoding paths. These checks
// validate result consistency; they do not turn a heuristic score into accuracy.
function assertResult(result, image, label) {
  assert.equal(result.digits.length, 8, `${label}: digit count`);
  assert.equal(result.review.length, 8, `${label}: review count`);
  assert.equal(result.certainties.length, 8, `${label}: certainty count`);
  assert.equal(result.scores.length, 8, `${label}: score row count`);
  assert.ok(Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 100,
    `${label}: heuristic score must be finite and in range`);
  const selectedPoints = new Set();
  for (let pi = 0; pi < 8; pi++) {
    const digit = result.digits[pi], point = result.zoneBest[pi];
    assert.ok(Number.isInteger(digit) && digit >= -1 && digit < 8, `${label}: P${pi} digit`);
    assert.equal(typeof result.review[pi], 'boolean', `${label}: P${pi} review`);
    assert.ok(Number.isFinite(result.certainties[pi]) && result.certainties[pi] >= 0 && result.certainties[pi] <= 1,
      `${label}: P${pi} certainty`);
    assert.equal(result.scores[pi].length, 8, `${label}: P${pi} score count`);
    assert.ok(result.scores[pi].every(score => Number.isFinite(score) && score >= 0), `${label}: P${pi} scores`);
    if (digit < 0) {
      assert.ok(point == null, `${label}: P${pi} missing point`);
      assert.equal(result.certainties[pi], 0, `${label}: P${pi} missing certainty`);
      assert.equal(result.review[pi], true, `${label}: P${pi} missing review`);
      continue;
    }
    assert.ok(point, `${label}: P${pi} selected point`);
    assert.equal(point.pi, pi, `${label}: P${pi} selected zone`);
    assert.equal(point.si, digit, `${label}: P${pi} selected subcell`);
    assert.ok(Number.isFinite(point.cx) && point.cx >= 0 && point.cx < image.width, `${label}: P${pi} x`);
    assert.ok(Number.isFinite(point.cy) && point.cy >= 0 && point.cy < image.height, `${label}: P${pi} y`);
    assert.ok(result.cellBest[pi][digit], `${label}: P${pi} selected cell candidate`);
    assert.equal(result.cellBest[pi][digit].cx, point.cx, `${label}: P${pi} selected cell x`);
    assert.equal(result.cellBest[pi][digit].cy, point.cy, `${label}: P${pi} selected cell y`);
    const key = `${point.cx},${point.cy}`;
    assert.equal(selectedPoints.has(key), false, `${label}: a physical point cannot fill multiple zones`);
    selectedPoints.add(key);
  }
}

module.exports = { assertResult };
