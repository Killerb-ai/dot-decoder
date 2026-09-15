const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sharp = require('sharp');

function renderGallery(rows) {
  const code = digits => digits.map(digit => digit < 0 ? '?' : digit).join('');
  const byId = id => document.getElementById(id);
  function render() {
    const profile = byId('profile').value, filter = byId('filter').value;
    const selected = rows.filter(row => (profile === 'all' || row.profile === profile) &&
      (filter === 'all' || filter === 'improved' && row.metrics.located > row.before.metrics.located ||
        filter === 'miss' && (row.metrics.located < row.metrics.labeled || row.metrics.falsePoints > 0) ||
        filter === 'unsafe' && row.metrics.unsafeZones > 0));
    byId('count').textContent = selected.length + '장';
    byId('gallery').replaceChildren();
    for (const row of selected) {
      const card = document.createElement('article');
      card.className = 'card ' + (row.metrics.unsafeZones ? 'bad' : row.metrics.located > row.before.metrics.located ? 'good' : '');
      const title = document.createElement('strong'); title.textContent = row.id;
      const link = document.createElement('a'); link.href = 'holdout/' + row.sample.file; link.target = '_blank';
      const img = document.createElement('img'); img.src = link.href; img.loading = 'lazy'; img.alt = row.id; link.append(img);
      const detail = document.createElement('pre');
      detail.textContent = [row.sample.ambiguous ? '정답: 다중 가설' : '정답: ' + code(row.expected),
        '기존: ' + code(row.before.predicted), '개선: ' + code(row.predicted),
        '점 위치: ' + row.before.metrics.located + ' → ' + row.metrics.located + ' / ' + row.metrics.labeled,
        '검토 영역: ' + row.review.filter(Boolean).length + ' / 8', '점수: ' + row.score + ' / 100'].join('\n');
      card.append(title, link, detail); byId('gallery').append(card);
    }
  }
  byId('profile').onchange = render; byId('filter').onchange = render; render();
}

async function main() {
  const root = path.resolve('.local-tests/self-validation');
  const read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
  const before = await read('holdout-baseline.json'), after = await read('holdout-candidate.json');
  const devBefore = await read('development-baseline.json'), devAfter = await read('development-candidate-v2.json');
  const selection = await read('selection.json');
  assert.equal(after.sourceSha256, selection.candidateSha256, 'evaluation must use the frozen candidate');
  assert.equal(after.sourceSha256, crypto.createHash('sha256').update(await fs.readFile('index.html')).digest('hex'), 'app changed after holdout evaluation');
  assert.equal(before.sourceSha256, devBefore.sourceSha256);
  assert.deepEqual(before.rows.map(r => r.id), after.rows.map(r => r.id));
  const manifest = await read('holdout/manifest.json');
  const rate = (n, d) => d ? (100 * n / d).toFixed(1) : '0.0';
  const summary = {
    baselineCommit: 'a1c5913', generatorVersion: 1,
    sourceHashes: { baseline: before.sourceSha256, candidate: after.sourceSha256 },
    protocol: { developmentImages: devBefore.totals.images, holdoutImages: before.totals.images,
      profiles: Object.keys(after.profiles), developmentSeed: 902101, holdoutSeed: 71829011,
      candidateSelectedBeforeHoldout: true, generatorLabelSource: 'Independent encoder digits and coordinates',
      sharpVersion: sharp.versions.sharp, nodeVersion: process.version,
      caveat: 'Unseen seeds from the same synthetic generator, not independently sourced real documents. Synthetic images exercise the sparse path, not QR alignment.' },
    development: { before: devBefore.totals, after: devAfter.totals },
    holdout: { before: before.totals, after: after.totals, profilesBefore: before.profiles, profilesAfter: after.profiles },
  };
  await fs.writeFile('tests/self-validation-results.json', JSON.stringify(summary, null, 2));
  const rows = after.rows.map((row, i) => ({ ...row, before: before.rows[i], sample: manifest.samples[i] }));
  const encodedRows = JSON.stringify(rows).replace(/</g, () => String.fromCharCode(92) + 'u003c');
  const metric = (label, a, b) => `<tr><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>점 디코더 무작위 자기 검증</title><style>
body{font:16px/1.6 system-ui,sans-serif;background:#f4f5f7;color:#17212b;margin:0}main{max-width:1250px;margin:auto;padding:32px}h1{line-height:1.25}p{max-width:900px}table{border-collapse:collapse;background:white;width:100%;max-width:850px}th,td{text-align:left;padding:10px 16px;border-bottom:1px solid #dce1e7}th{font-weight:600}select{font:inherit;padding:8px;margin:8px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;margin-top:20px}.card{background:white;border:1px solid #dce1e7;border-radius:10px;padding:16px}.card img{width:100%;height:250px;object-fit:contain;background:#edf0f3}.card pre{white-space:pre-wrap;font-size:13px}.bad{border-color:#b34733}.good{border-color:#358269}small{color:#52606d}.note{padding:14px;border-left:4px solid #ad632a;background:#fff5e5}
</style><main><h1>무작위 이미지로 검증한 디코더 개선</h1>
<p>개발용 ${devBefore.totals.images}장으로 수정안을 선택한 뒤, 별도 난수로 만든 평가용 ${before.totals.images}장에 기존 코드와 수정 코드를 동일하게 적용했습니다. 아래 수치는 평가용 데이터만 집계한 결과입니다.</p>
<table><thead><tr><th>평가 지표</th><th>기존</th><th>개선</th></tr></thead><tbody>
${metric('정확한 숫자와 점 위치', `${before.totals.located}/${before.totals.labeled} (${rate(before.totals.located,before.totals.labeled)}%)`, `${after.totals.located}/${after.totals.labeled} (${rate(after.totals.located,after.totals.labeled)}%)`)}
${metric('8자리 전체 코드 일치', `${before.totals.correctCode}/${before.totals.eligible} (${rate(before.totals.correctCode,before.totals.eligible)}%)`, `${after.totals.correctCode}/${after.totals.eligible} (${rate(after.totals.correctCode,after.totals.eligible)}%)`)}
${metric('자동 확정된 이미지', before.totals.accepted, after.totals.accepted)}
${metric('잘못 자동 확정된 전체 이미지', before.totals.unsafeDocuments, after.totals.unsafeDocuments)}
${metric('잘못 자동 표시된 개별 영역', before.totals.unsafeZones, after.totals.unsafeZones)}
</tbody></table><p class="note">합성 데이터의 성능은 실물 문서의 정확도 보장이 아닙니다. 글자에 가려진 점, 잡음과 코드의 구별, 다중 가설은 여전히 어렵습니다. 자동 확정은 줄고 검토 요구는 늘었습니다. 이 이미지는 QR 정렬을 평가하지 않습니다.</p>
<h2>평가 이미지 ${before.totals.images}장</h2><label>조건 <select id="profile"><option value="all">전체</option>${Object.keys(after.profiles).map(p=>`<option>${p}</option>`).join('')}</select></label>
<label>보기 <select id="filter"><option value="all">전체</option><option value="improved">점 위치 개선</option><option value="miss">미검출·오검출 포함</option><option value="unsafe">검토 누락 포함</option></select></label><span id="count"></span><div class="grid" id="gallery"></div>
<script>(${renderGallery.toString()})(${encodedRows});</script></main></html>`;
  await fs.writeFile(path.join(root, 'report.html'), html);
  const parts=[];
  for (const [i,profile] of ['clean','faint','gradient','dust','text','overlap'].entries()) {
    const row=rows.find(r=>r.profile===profile), imagePath=path.join(root,'holdout',row.sample.file);
    const thumb=await sharp(imagePath).resize({width:180,height:230,fit:'inside'}).png().toBuffer();
    const [px,py]=row.sample.points[0];
    const crop=await sharp(imagePath).extract({left:Math.max(0,Math.min(row.sample.width-48,Math.round(px)-24)),top:Math.max(0,Math.min(row.sample.height-48,Math.round(py)-24)),width:48,height:48}).resize(168,168,{kernel:'nearest'}).png().toBuffer();
    const left=(i%2)*440,top=Math.floor(i/2)*330;
    const code=ds=>ds.map(d=>d<0?'?':d).join('');
    const caption=Buffer.from(`<svg width="440" height="330"><rect width="440" height="330" fill="white"/><text x="14" y="25" font-family="Arial" font-size="17" font-weight="bold">${profile} / ${row.id}</text><text x="210" y="66" font-family="Arial" font-size="13">P0 crop (3.5x)</text><text x="14" y="290" font-family="Arial" font-size="14">Truth ${code(row.expected)} | Before ${code(row.before.predicted)}</text><text x="14" y="313" font-family="Arial" font-size="14">After ${code(row.predicted)} | Located ${row.metrics.located}/8</text></svg>`);
    parts.push({input:caption,left,top},{input:thumb,left:left+14,top:top+34},{input:crop,left:left+210,top:top+80});
  }
  await sharp({create:{width:880,height:990,channels:3,background:'#dce1e7'}}).composite(parts).png().toFile(path.join(root,'examples.png'));
  console.log(JSON.stringify({report:path.join(root,'report.html'),preview:path.join(root,'examples.png'),summary:'tests/self-validation-results.json'}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
