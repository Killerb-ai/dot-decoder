// ============================================================
//  v7.1 — 용지 기준 8×8 격자 디코더 (QR 불필요)
//  · 격자 = 용지 전체를 가로 8 × 세로 8 균등분할 (기본 4×2, 세부 2×4)
//  · 인쇄 오프셋·미세회전·전단은 점 자체로 자기보정(affine EM)
//  · 가려진 점(글자/표선 위)은 "가려짐 + 블롭응답"으로 추론, 신뢰도 하향
//  · 실측 13장(220dpi 8장 + 300dpi 5장) 102/104 자릿 일치
// ============================================================
const V7 = { WS: 30, WO: 5, TAU: 3.0, TAU_H: 3.5, OCC_REL: 0.3 };

function v7Box(src, w, h, r) {           // 경계 축소창 평균(분리형 누적합)
  const t = new Float32Array(w * h), out = new Float32Array(w * h), cs = new Float64Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w; cs[0] = 0;
    for (let x = 0; x < w; x++) cs[x + 1] = cs[x] + src[o + x];
    for (let x = 0; x < w; x++) { const x0 = x - r < 0 ? 0 : x - r, x1 = x + r >= w ? w - 1 : x + r; t[o + x] = (cs[x1 + 1] - cs[x0]) / (x1 - x0 + 1); }
  }
  for (let x = 0; x < w; x++) {
    cs[0] = 0;
    for (let y = 0; y < h; y++) cs[y + 1] = cs[y] + t[y * w + x];
    for (let y = 0; y < h; y++) { const y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= h ? h - 1 : y + r; out[y * w + x] = (cs[y1 + 1] - cs[y0]) / (y1 - y0 + 1); }
  }
  return out;
}
function v7Max5(src, w, h) {              // 5×5 최대값 필터(분리형)
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = 0; x < w; x++) { let m = -1e9; for (let d = -2; d <= 2; d++) { const xx = x + d; if (xx >= 0 && xx < w && src[r + xx] > m) m = src[r + xx]; } t[r + x] = m; } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = -1e9; for (let d = -2; d <= 2; d++) { const yy = y + d; if (yy >= 0 && yy < h && t[yy * w + x] > m) m = t[yy * w + x]; } o[y * w + x] = m; }
  return o;
}
function v7NoiseSigma(g, w, h) {
  const b = v7Box(g, w, h, 1), hist = new Float64Array(2000);
  for (let i = 0; i < w * h; i++) hist[Math.min(1999, (Math.abs(g[i] - b[i]) * 10) | 0)]++;
  let c = 0; const half = w * h / 2;
  for (let k = 0; k < 2000; k++) { c += hist[k]; if (c >= half) return 1.4826 * ((k + 0.5) / 10) / Math.sqrt(8 / 9); }
  return 0;
}
function v7Prep(g, w, h) {
  const k = w / 1821;
  const sig = v7NoiseSigma(g, w, h);
  let gd = g;
  if (sig > 4.5) gd = v7Box(gd, w, h, 1);
  if (sig > 9.0) gd = v7Box(gd, w, h, 1);
  const mx = v7Max5(gd, w, h);
  const bg = v7Box(mx, w, h, Math.max(7, Math.round(15 * k)));
  const thm = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const v = bg[i] - gd[i]; thm[i] = v > 0 ? v : 0; }
  return { thm, k, sig };
}
function v7Candidates(thm, w, h, k, T = 30) {
  const n = w * h, dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) dark[i] = thm[i] > T ? 1 : 0;
  const W1 = w + 1, ii = new Int32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += dark[y * w + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + row; } }
  const lab = new Uint8Array(n), st = new Int32Array(n), C = [];
  const maxd = 7 * k + 1, maxa = 30 * k * k + 4, R = Math.round(12 * k);
  for (let i0 = 0; i0 < n; i0++) {
    if (!dark[i0] || lab[i0]) continue;
    let sp = 0; st[sp++] = i0; lab[i0] = 1;
    let x0 = i0 % w, x1 = x0, y0 = (i0 / w) | 0, y1 = y0, a = 0, sw = 0, sx = 0, sy = 0, mx = 0;
    while (sp > 0) {
      const q = st[--sp], py = (q / w) | 0, px = q - py * w, v = thm[q];
      a++; sw += v; sx += px * v; sy += py * v; if (v > mx) mx = v;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = py + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx; if (dark[j] && !lab[j]) { lab[j] = 1; st[sp++] = j; }
        }
      }
    }
    if (Math.max(x1 - x0 + 1, y1 - y0 + 1) > maxd || a > maxa) continue;
    const cx = sx / sw, cy = sy / sw, ix = Math.round(cx), iy = Math.round(cy);
    const X0 = Math.max(0, ix - R), Y0 = Math.max(0, iy - R), X1 = Math.min(w, ix + R + 1), Y1 = Math.min(h, iy + R + 1);
    const ring = ii[Y1 * W1 + X1] - ii[Y0 * W1 + X1] - ii[Y1 * W1 + X0] + ii[Y0 * W1 + X0] - a;
    C.push({ x: cx, y: cy, a, c: mx, ring });
  }
  return C;
}
function v7Score(C, k, aref, cref) {
  const a0 = aref == null ? 8 * k * k : aref;
  return C.map(d => {
    const sz = Math.exp(-0.5 * Math.pow(Math.log(Math.max(d.a, 1) / a0) / 0.45, 2));
    const ct = cref == null ? Math.min(1, Math.max(0, (d.c - 45) / 80)) : Math.min(1, Math.max(0, (d.c - 0.3 * cref) / (0.4 * cref)));
    return sz * ct * Math.exp(-d.ring / (120 * k * k));
  });
}
function v7GaussKernel(sig) {             // cv2 float 커널 반경(≈4σ)과 동일
  const ks = (Math.round(sig * 8 + 1)) | 1, r = (ks - 1) / 2, kk = new Float64Array(ks);
  let s = 0; for (let i = 0; i < ks; i++) { const x = i - r; kk[i] = Math.exp(-x * x / (2 * sig * sig)); s += kk[i]; }
  for (let i = 0; i < ks; i++) kk[i] /= s; return { kk, r };
}
function v7Refl(i, n) { if (n === 1) return 0; while (i < 0 || i >= n) { if (i < 0) i = -i; if (i >= n) i = 2 * n - 2 - i; } return i; }
function v7Gauss2(src, w, h, sig) {       // 분리형 가우시안(BORDER_REFLECT_101)
  const { kk, r } = v7GaussKernel(sig), t = new Float64Array(w * h), o = new Float64Array(w * h);
  const ix = new Int32Array(w + 2 * r), iy = new Int32Array(h + 2 * r);
  for (let i = 0; i < w + 2 * r; i++) ix[i] = v7Refl(i - r, w);
  for (let i = 0; i < h + 2 * r; i++) iy[i] = v7Refl(i - r, h);
  for (let y = 0; y < h; y++) { const o0 = y * w; for (let x = 0; x < w; x++) { let s = 0; for (let i = 0; i <= 2 * r; i++) s += kk[i] * src[o0 + ix[x + i]]; t[o0 + x] = s; } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = 0; i <= 2 * r; i++) s += kk[i] * t[iy[y + i] * w + x]; o[y * w + x] = s; }
  return o;
}
function v7Vote(C, s, W, H, k, npk = 6) {
  const px = W / 8, py = H / 8, cxp = W / 2, cyp = H / 2;
  const P = []; for (let i = 0; i < C.length; i++) if (s[i] > 0.05) P.push(i);
  const lox = -40 * k, hix = 50 * k, loy = -40 * k, hiy = 60 * k;
  const nbx = Math.ceil(hix - lox), nby = Math.ceil(hiy - loy);
  const win = (Math.floor(6 * k) | 1), wr = (win - 1) / 2;
  const peaks = [];
  for (let di = 0; di <= 12; di++) {
    const t = (-1.5 + 0.25 * di) * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
    const hist = new Float64Array(nbx * nby);
    for (const i of P) {
      const dx = C[i].x - cxp, dy = C[i].y - cyp;
      const ux = cxp + ct * dx + st * dy, uy = cyp - st * dx + ct * dy;
      const gx = ux / px - 0.5, gy = uy / py - 0.5;
      const rx = (gx - Math.round(gx)) * px, ry = (gy - Math.round(gy)) * py;
      if (!(rx > lox && rx < hix && ry > loy && ry < hiy)) continue;
      const a = Math.floor(rx - lox), b = Math.floor(ry - loy);
      if (a >= 0 && a < nbx && b >= 0 && b < nby) hist[a * nby + b] += s[i];
    }
    const hs = v7Gauss2(hist, nby, nbx, 2.0 * k);   // 행=a(x), 열=b(y)
    for (let a = 0; a < nbx; a++) for (let b = 0; b < nby; b++) {
      const v = hs[a * nby + b]; if (!(v > 0)) continue;
      let ok = true;
      for (let da = -wr; da <= wr && ok; da++) { const aa = a + da; if (aa < 0 || aa >= nbx) continue;
        for (let db = -wr; db <= wr; db++) { const bb = b + db; if (bb < 0 || bb >= nby) continue; if (hs[aa * nby + bb] > v) { ok = false; break; } } }
      if (ok) peaks.push({ v, t, ox: lox + a + 0.5, oy: loy + b + 0.5 });
    }
  }
  peaks.sort((p, q) => q.v - p.v);
  const out = [];
  for (const p of peaks) {
    if (out.every(q => Math.abs(p.ox - q.ox) > 4 * k || Math.abs(p.oy - q.oy) > 4 * k || Math.abs(p.t - q.t) > 1e-3)) out.push(p);
    if (out.length >= npk) break;
  }
  return out;
}
function v7Pred(G, c, r) { return [G[0] + G[1] * (c + 0.5) + G[2] * (r + 0.5), G[3] + G[4] * (c + 0.5) + G[5] * (r + 0.5)]; }
function v7InitGrid(W, H, t, ox, oy) {
  const px = W / 8, py = H / 8, cx = W / 2, cy = H / 2, ct = Math.cos(t), st = Math.sin(t);
  return [cx + ct * (ox - cx) - st * (oy - cy), ct * px, -st * py, cy + st * (ox - cx) + ct * (oy - cy), st * px, ct * py];
}
function v7CellS(C, s, G, k, sig) {
  const S = [], idx = [];
  for (let r = 0; r < 8; r++) { S.push(new Float64Array(8)); idx.push(new Int32Array(8).fill(-1));
    for (let c = 0; c < 8; c++) {
      const [X, Y] = v7Pred(G, c, r); let bw = -1, bj = -1;
      for (let j = 0; j < C.length; j++) {
        const dx = C[j].x - X, dy = C[j].y - Y;
        if (Math.abs(dx) > 8 * sig * k || Math.abs(dy) > 8 * sig * k) continue;
        const wv = s[j] * Math.exp(-0.5 * (dx * dx + dy * dy) / Math.pow(sig * k, 2));
        if (wv > bw) { bw = wv; bj = j; }
      }
      S[r][c] = bw > 0 ? bw : 0; idx[r][c] = bj;
    } }
  return { S, idx };
}
function v7Solve3(M, b) {                 // 3×3 가우스 소거
  const A = M.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let j = i + 1; j < 3; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
    [A[i], A[p]] = [A[p], A[i]];
    for (let j = i + 1; j < 3; j++) { const f = A[j][i] / A[i][i]; for (let q = i; q < 4; q++) A[j][q] -= f * A[i][q]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = A[i][3]; for (let q = i + 1; q < 3; q++) s -= A[i][q] * x[q]; x[i] = s / A[i][i]; }
  return x;
}
function v7FitAffine(pts, w, G0, lam) {
  const G = G0.slice();
  for (const [o0, key] of [[0, 'x'], [3, 'y']]) {
    const M = [[lam[0], 0, 0], [0, lam[1], 0], [0, 0, lam[2]]], b = [lam[0] * G[o0], lam[1] * G[o0 + 1], lam[2] * G[o0 + 2]];
    pts.forEach((p, i) => { const a = [1, p.c + 0.5, p.r + 0.5];
      for (let u = 0; u < 3; u++) { b[u] += w[i] * a[u] * p[key]; for (let v = 0; v < 3; v++) M[u][v] += w[i] * a[u] * a[v]; } });
    const sol = v7Solve3(M, b); G[o0] = sol[0]; G[o0 + 1] = sol[1]; G[o0 + 2] = sol[2];
  }
  return G;
}
function v7Median(a) { if (!a.length) return null; const b = a.slice().sort((u, v) => u - v); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; }
function v7EMFit(C, s, W, H, k, t, ox, oy) {
  const G0 = v7InitGrid(W, H, t, ox, oy); let G = G0.slice(); const lam = [1e-4, 0.5, 0.5]; let cref = null;
  for (const sg of [6, 4, 3, 2.5]) {
    const { S, idx } = v7CellS(C, s, G, k, sg);
    const pts = [], w = [];
    for (let reg = 0; reg < 8; reg++) {
      const R = reg >> 1, Cc = reg & 1; let bv = -1, br = 0, bc = 0;
      for (let rr = 2 * R; rr < 2 * R + 2; rr++) for (let cc = 4 * Cc; cc < 4 * Cc + 4; cc++) if (S[rr][cc] > bv) { bv = S[rr][cc]; br = rr; bc = cc; }
      if (bv < 0.15) continue;
      const q = idx[br][bc]; pts.push({ c: bc, r: br, x: C[q].x, y: C[q].y, q }); w.push(bv);
    }
    if (pts.length >= 4) G = v7FitAffine(pts, w, G0, lam);
    const good = pts.filter((p, i) => w[i] > 0.3);
    if (good.length >= 3) {
      let aref = v7Median(good.map(p => C[p.q].a)); cref = v7Median(good.map(p => C[p.q].c));
      aref = Math.min(30 * k * k, Math.max(4 * k * k, aref)); cref = Math.max(cref, 50);
      s = v7Score(C, k, aref, cref);
    }
  }
  return { G, s, cref };
}
function v7PatchFeats(thm, w, h, G, k, tocc) {
  const B = [], O = [];
  const P = Math.ceil(12 * k), N = 2 * P + 1, sg = 1.1 * k, rO = 3.5 * k, rB = 2.5 * k, dr = Math.round(2 * k) + 1;
  for (let r = 0; r < 8; r++) { B.push(new Float64Array(8)); O.push(new Float64Array(8));
    for (let c = 0; c < 8; c++) {
      const [X, Y] = v7Pred(G, c, r), ix = Math.round(X), iy = Math.round(Y);
      if (ix - P < 0 || iy - P < 0 || ix + P >= w || iy + P >= h) { O[r][c] = 1; continue; }
      const p = new Float64Array(N * N);
      for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) p[yy * N + xx] = thm[(iy - P + yy) * w + ix - P + xx];
      const g = v7Gauss2(p, N, N, sg);
      const at = (yy, xx) => g[v7Refl(yy, N) * N + v7Refl(xx, N)];
      const fx = X - ix, fy = Y - iy;
      let bmax = -1e9, on = 0, oc = 0;
      // 가림: 임계 초과 마스크를 원판(dr)으로 팽창한 뒤 rO 원판 평균
      const mk = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) mk[i] = p[i] > tocc ? 1 : 0;
      for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
        const ddx = xx - P - fx, ddy = yy - P - fy, d2 = ddx * ddx + ddy * ddy;
        if (d2 <= rB * rB) {
          const Hxx = (at(yy - 1, xx - 1) - 2 * at(yy - 1, xx) + at(yy - 1, xx + 1) + 2 * (at(yy, xx - 1) - 2 * at(yy, xx) + at(yy, xx + 1)) + at(yy + 1, xx - 1) - 2 * at(yy + 1, xx) + at(yy + 1, xx + 1)) / 4;
          const Hyy = (at(yy - 1, xx - 1) - 2 * at(yy, xx - 1) + at(yy + 1, xx - 1) + 2 * (at(yy - 1, xx) - 2 * at(yy, xx) + at(yy + 1, xx)) + at(yy - 1, xx + 1) - 2 * at(yy, xx + 1) + at(yy + 1, xx + 1)) / 4;
          const Hxy = (at(yy - 1, xx - 1) - at(yy - 1, xx + 1) - at(yy + 1, xx - 1) + at(yy + 1, xx + 1)) / 4;
          const tr = (Hxx + Hyy) / 2, dt = Math.sqrt(((Hxx - Hyy) / 2) ** 2 + Hxy * Hxy);
          const bl = Math.max(0, -(tr + dt)) * sg * sg; if (bl > bmax) bmax = bl;
        }
        if (d2 <= rO * rO) {
          let hit = 0;
          for (let a = -dr; a <= dr && !hit; a++) { const y2 = yy + a; if (y2 < 0 || y2 >= N) continue;
            for (let b = -dr; b <= dr; b++) { if (a * a + b * b > dr * dr) continue; const x2 = xx + b; if (x2 < 0 || x2 >= N) continue; if (mk[y2 * N + x2]) { hit = 1; break; } } }
          on += hit; oc++;
        }
      }
      B[r][c] = bmax; O[r][c] = oc ? on / oc : 0;
    } }
  return { B, O };
}
function v7DecodeOriented(g, w, h) {
  const { thm, k, sig } = v7Prep(g, w, h);
  const C = v7Candidates(thm, w, h, k);
  if (C.length < 3) return null;
  const s0 = v7Score(C, k);
  let best = null;
  for (const pk of v7Vote(C, s0, w, h, k)) {
    const f = v7EMFit(C, s0, w, h, k, pk.t, pk.ox, pk.oy);
    const { S } = v7CellS(C, f.s, f.G, k, 2.5);
    let q = 0; for (let reg = 0; reg < 8; reg++) { const R = reg >> 1, Cc = reg & 1; let m = 0; for (let rr = 2 * R; rr < 2 * R + 2; rr++) for (let cc = 4 * Cc; cc < 4 * Cc + 4; cc++) m = Math.max(m, S[rr][cc]); q += m; }
    if (!best || q > best.q) best = { q, ...f, t: pk.t };
  }
  if (!best) return null;                 // 격자 투표 봉우리 없음 → 용지격자 아님
  const { G, s, cref } = best;
  const { S, idx } = v7CellS(C, s, G, k, 2.5);
  const tocc = cref ? Math.max(30, V7.OCC_REL * cref) : 30;
  const { B, O } = v7PatchFeats(thm, w, h, G, k, tocc);
  const vis = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (S[r][c] > 0.5) vis.push(B[r][c]);
  const Bref = vis.length >= 3 ? v7Median(vis) : 30;
  const digits = [], probs = [], pvec = [], alt = [], cells = [];
  for (let reg = 0; reg < 8; reg++) {
    const R = reg >> 1, Cc = reg & 1, T = [], Sb = [];
    for (let d = 0; d < 8; d++) { const rr = 2 * R + (d >> 2), cc = 4 * Cc + (d & 3);
      T.push(30 * Math.min(B[rr][cc] / Math.max(Bref, 3), 1.5) + V7.WS * S[rr][cc] + V7.WO * O[rr][cc]); Sb.push(S[rr][cc]); }
    let j = 0; for (let d = 1; d < 8; d++) if (T[d] > T[j]) j = d;
    const tau = Sb[j] >= 0.3 ? V7.TAU : V7.TAU_H, mxT = T[j];
    const e = T.map(v => Math.exp((v - mxT) / tau)), es = e.reduce((a, b) => a + b, 0), p = e.map(v => v / es);
    let j2 = -1; for (let d = 0; d < 8; d++) if (d !== j && (j2 < 0 || p[d] > p[j2])) j2 = d;
    const rr = 2 * R + (j >> 2), cc = 4 * Cc + (j & 3);
    let [cx, cy] = v7Pred(G, cc, rr); const q = idx[rr][cc];
    const visible = Sb[j] >= 0.3 && q >= 0;
    if (visible) { cx = C[q].x; cy = C[q].y; }
    digits.push(j); probs.push(p[j]); pvec.push(p); alt.push({ d: j2, p: p[j2] });
    cells.push({ cx, cy, visible, S: Sb[j], O: O[rr][cc], B: B[rr][cc] });
  }
  const cand = C.map((d, i) => ({ cx: d.x, cy: d.y, area: d.a, score: s[i] })).filter(d => d.score > 0.05).sort((a, b) => b.score - a.score).slice(0, 300);
  const oyk = (G[3] + G[5] * 4 - h / 2) / k;
  return { digits, probs, pvec, alt, cells, G, k, sig, Bref, cref, oyk, ang: best.t * 180 / Math.PI, cand };
}
function v7RotGray(g, w, h, mode) {       // mode: 180 | 'cw' | 'ccw'
  if (mode === 180) { const o = new Float32Array(w * h); for (let i = 0; i < w * h; i++) o[i] = g[w * h - 1 - i]; return { g: o, w, h }; }
  const o = new Float32Array(w * h), W2 = h, H2 = w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let x2, y2; if (mode === 'cw') { x2 = h - 1 - y; y2 = x; } else { x2 = y; y2 = w - 1 - x; }
    o[y2 * W2 + x2] = g[y * w + x];
  }
  return { g: o, w: W2, h: H2 };
}
function v7MapBack(x, y, mode, w0, h0) {  // 회전된 좌표 → 원본 좌표
  if (mode === 0) return [x, y];
  if (mode === 180) return [w0 - 1 - x, h0 - 1 - y];
  if (mode === 'cw') return [y, h0 - 1 - x];     // x2=h0-1-y0, y2=x0
  return [w0 - 1 - y, x];                        // ccw: x2=y0, y2=w0-1-x0
}
function analyzeV7(imageData) {
  const w = imageData.width, h = imageData.height;
  if (Math.min(w, h) < 700) return { digits: null, mode: '해상도 부족(짧은변 700px 미만)' };
  const g0 = toGrayFloat(imageData);
  let res = null, mode = 0;
  if (w <= h) { res = v7DecodeOriented(g0, w, h); if (res && res.oyk > -3) mode = 0; else res = null; }
  if (!res) {
    const modes = w > h ? ['cw', 'ccw'] : [0, 180];
    for (const m of modes) {
      const rg = m === 0 ? { g: g0, w, h } : v7RotGray(g0, w, h, m);
      const r = v7DecodeOriented(rg.g, rg.w, rg.h);
      if (r && (!res || r.oyk > res.oyk)) { res = r; mode = m; }
    }
  }
  if (!res) return { digits: null, mode: '점 후보 없음' };
  const zoneBest = {}, scores = [];
  for (let pi = 0; pi < 8; pi++) {
    const c = res.cells[pi], [cx, cy] = v7MapBack(c.cx, c.cy, mode, w, h);
    zoneBest[pi] = { cx: Math.round(cx), cy: Math.round(cy), pi, si: res.digits[pi], score: res.probs[pi], p: Math.round(100 * res.probs[pi]),
                     visible: c.visible, alt: res.alt[pi].d, altP: Math.round(100 * res.alt[pi].p) };
    scores.push(Array.from(res.pvec[pi]));
  }
  const candidates = res.cand.map(d => { const [x, y] = v7MapBack(d.cx, d.cy, mode, w, h); return { cx: Math.round(x), cy: Math.round(y), area: d.area, score: d.score }; });
  const conf = Math.round(100 * res.probs.reduce((a, b) => a * b, 1));
  // 표시용 영역: 보정 격자의 외곽(회전 매핑 후 축정렬 외접)
  const G = res.G, corners = [[0, 0], [8, 0], [0, 8], [8, 8]].map(([c, r]) => {
    const X = G[0] + G[1] * c + G[2] * r, Y = G[3] + G[4] * c + G[5] * r; return v7MapBack(X, Y, mode, w, h); });
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
  let region = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  if (mode === 'cw' || mode === 'ccw') region = null;  // 가로 이미지: 격자 축이 바뀌므로 격자 오버레이 생략
  const hidden = res.cells.filter(c => !c.visible).length;
  const modeTxt = 'v7.1 용지격자' + (mode !== 0 ? ` (${mode === 180 ? '180°' : mode === 'cw' ? '90°↻' : '90°↺'} 회전 판독)` : '') +
                  (Math.abs(res.ang) >= 0.2 ? ` · 기울기 ${res.ang.toFixed(2)}°` : '') + (hidden ? ` · 가려진 점 추론 ${hidden}곳` : '');
  return { digits: res.digits, scores, candidates, zoneBest, confidence: conf, mode: modeTxt, region, orient: mode, hidden, probs: res.probs };
}
