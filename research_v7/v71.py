# v7 final research pipeline (mirrors JS port). Page-anchored 8x8 grid, no QR.
import cv2, numpy as np

def box(a, r):
    return cv2.blur(a, (2*r+1, 2*r+1), borderType=cv2.BORDER_REPLICATE)

def noise_sigma(g):
    b1 = box(g, 1)
    v = np.abs(g - b1)
    return 1.4826*np.median(v)/np.sqrt(8/9)

def prep(g):
    H, W = g.shape
    k = W/1821.0
    sig = noise_sigma(g)
    gd = g
    if sig > 4.5: gd = box(gd, 1)
    if sig > 9.0: gd = box(gd, 1)
    mx = cv2.dilate(gd, np.ones((5, 5), np.uint8))
    r = max(7, int(round(15*k)))
    bg = box(mx, r)
    thm = np.maximum(0, bg-gd)
    return thm, k, sig

def candidates(thm, k, T=30):
    H, W = thm.shape
    dark = (thm > T).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark, connectivity=8)
    ii = cv2.integral(dark)
    out = []
    maxd = 7*k+1; maxa = 30*k*k+4; R = int(round(12*k))
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if max(w, h) > maxd or a > maxa: continue
        # intensity-weighted centroid
        sub = thm[y:y+h, x:x+w]*(lab[y:y+h, x:x+w] == i)
        sw = sub.sum(); yy, xx = np.mgrid[y:y+h, x:x+w]
        cx = (sub*xx).sum()/sw; cy = (sub*yy).sum()/sw
        ix, iy = int(round(cx)), int(round(cy))
        x0, y0, x1, y1 = max(0, ix-R), max(0, iy-R), min(W, ix+R+1), min(H, iy+R+1)
        ring = ii[y1, x1]-ii[y0, x1]-ii[y1, x0]+ii[y0, x0]-a
        c = float(sub.max())
        out.append((cx, cy, a, c, ring))
    C = np.array(out) if out else np.zeros((0, 5))
    return C

def cscore(C, k, aref=None, cref=None):
    if len(C) == 0: return np.zeros(0)
    a0 = 8.0*k*k if aref is None else aref
    sz = np.exp(-0.5*(np.log(np.maximum(C[:, 2], 1)/a0)/0.45)**2)
    if cref is None: ct = np.clip((C[:, 3]-45)/80, 0, 1)
    else: ct = np.clip((C[:, 3]-0.3*cref)/(0.4*cref), 0, 1)
    iso = np.exp(-C[:, 4]/(120*k*k))
    return sz*ct*iso

def vote(C, s, W, H, k, npk=6):
    # search small rotation + offset; returns (score, ang_rad, ox, oy)
    px, py = W/8, H/8
    cxp, cyp = W/2, H/2
    m0 = s > 0.05
    Cx, Cy, sw = C[m0, 0], C[m0, 1], s[m0]
    lo_x, hi_x = -40*k, 50*k; lo_y, hi_y = -40*k, 60*k
    nbx = int(np.ceil(hi_x-lo_x)); nby = int(np.ceil(hi_y-lo_y))
    peaks = []
    for deg in np.arange(-1.5, 1.5001, 0.25):
        t = np.deg2rad(deg)
        # un-rotate points about page centre
        dx, dy = Cx-cxp, Cy-cyp
        ux = cxp+np.cos(t)*dx+np.sin(t)*dy
        uy = cyp-np.sin(t)*dx+np.cos(t)*dy
        gx = ux/px-0.5; gy = uy/py-0.5
        rx = (gx-np.round(gx))*px; ry = (gy-np.round(gy))*py
        m = (rx > lo_x) & (rx < hi_x) & (ry > lo_y) & (ry < hi_y)
        hist = np.zeros((nbx, nby), np.float32)
        ix = np.floor(rx[m]-lo_x).astype(int); iy = np.floor(ry[m]-lo_y).astype(int)
        np.add.at(hist, (ix, iy), sw[m])
        hs = cv2.GaussianBlur(hist, (0, 0), 2.0*k)
        mxf = cv2.dilate(hs, np.ones((int(6*k)|1, int(6*k)|1), np.uint8))
        pk = np.argwhere((hs >= mxf) & (hs > 0))
        for (a, b) in pk:
            peaks.append((float(hs[a, b]), t, lo_x+a+0.5, lo_y+b+0.5))
    peaks.sort(key=lambda z: -z[0])
    # 근접 중복 제거 후 상위 npk
    out = []
    for p in peaks:
        if all(abs(p[2]-q[2]) > 4*k or abs(p[3]-q[3]) > 4*k or abs(p[1]-q[1]) > 1e-3 for q in out):
            out.append(p)
        if len(out) >= npk: break
    return out

def pred(G, c, r):
    return G[0]+G[1]*(c+.5)+G[2]*(r+.5), G[3]+G[4]*(c+.5)+G[5]*(r+.5)

def init_grid(W, H, t, ox, oy):
    # grid of un-rotated frame mapped back to image: X = R(t)*(u) where u=(ox+px*(c+.5), oy+py*(r+.5))
    px, py = W/8, H/8; cx, cy = W/2, H/2
    ct, st = np.cos(t), np.sin(t)
    # image = c + R(t)^-1 ... we un-rotated with ux = cx + ct*dx + st*dy  => dx = ct*(ux-cx) - st*(uy-cy)
    # X = cx + ct*(U-cx) - st*(V-cy), Y = cy + st*(U-cx) + ct*(V-cy), U = ox+px*a, V = oy+py*b
    G = np.zeros(6)
    G[1] = ct*px; G[2] = -st*py
    G[0] = cx+ct*(ox-cx)-st*(oy-cy)
    G[4] = st*px; G[5] = ct*py
    G[3] = cy+st*(ox-cx)+ct*(oy-cy)
    return G

def cell_S(C, s, G, k, sig):
    S = np.zeros((8, 8)); idx = -np.ones((8, 8), int)
    if len(C) == 0: return S, idx
    for r in range(8):
        for c in range(8):
            X, Y = pred(G, c, r)
            d2 = (C[:, 0]-X)**2+(C[:, 1]-Y)**2
            w = s*np.exp(-0.5*d2/(sig*k)**2)
            j = int(np.argmax(w)); S[r, c] = w[j]; idx[r, c] = j
    return S, idx

def fit_affine(pts, w, G0, lam):
    G = np.array(G0, float)
    A = np.array([[1, c+.5, r+.5] for c, r, _, _ in pts]); Wm = np.diag(w); L = np.diag(lam)
    for o0, col in ((0, 2), (3, 3)):
        y = np.array([p[col] for p in pts]); g0 = G[o0:o0+3]
        G[o0:o0+3] = np.linalg.solve(A.T@Wm@A+L, A.T@Wm@y+L@g0)
    return G

def patch_feats(thm, G, k, tocc=30.0):
    # per cell: B = Hessian blob max (radius 2.5k), O = occlusion (radius 3.5k)
    H, W = thm.shape
    B = np.zeros((8, 8)); O = np.zeros((8, 8))
    P = int(np.ceil(12*k)); sg = 1.1*k
    rO = 3.5*k; rB = 2.5*k
    dr = int(round(2*k))+1
    for r in range(8):
        for c in range(8):
            X, Y = pred(G, c, r); ix, iy = int(round(X)), int(round(Y))
            if ix-P < 0 or iy-P < 0 or ix+P >= W or iy+P >= H:
                O[r, c] = 1.0; continue
            p = thm[iy-P:iy+P+1, ix-P:ix+P+1]
            g = cv2.GaussianBlur(p, (0, 0), sg)
            Hxx = cv2.Sobel(g, cv2.CV_32F, 2, 0, ksize=3)/4
            Hyy = cv2.Sobel(g, cv2.CV_32F, 0, 2, ksize=3)/4
            Hxy = cv2.Sobel(g, cv2.CV_32F, 1, 1, ksize=3)/4
            tr = (Hxx+Hyy)/2; dt = np.sqrt(((Hxx-Hyy)/2)**2+Hxy**2)
            blob = np.maximum(0, -(tr+dt))*sg*sg
            yy, xx = np.mgrid[-P:P+1, -P:P+1]
            fx, fy = X-ix, Y-iy
            dB = ((xx-fx)**2+(yy-fy)**2) <= rB*rB
            B[r, c] = blob[dB].max()
            dk = (p > tocc).astype(np.uint8)
            dd = cv2.dilate(dk, DISK(dr))
            dO = ((xx-fx)**2+(yy-fy)**2) <= rO*rO
            O[r, c] = dd[dO].mean()
    return B, O

WS, WO, TAU, TAU_H = 30.0, 5.0, 3.0, 3.5
def DISK(r):
    yy, xx = np.mgrid[-r:r+1, -r:r+1]
    return ((xx*xx+yy*yy) <= r*r).astype(np.uint8)
import os as _os
OCC_REL = float(_os.environ.get("OCC_REL", "0.3"))

def em_fit(C, s, W, H, k, t, ox, oy):
    G0 = init_grid(W, H, t, ox, oy); G = G0.copy()
    lam = np.array([1e-4, 0.5, 0.5]); cref = None
    for sig_ in [6, 4, 3, 2.5]:
        S, idx = cell_S(C, s, G, k, sig_)
        pts = []; w = []
        for reg in range(8):
            R = reg//2; Cc = reg % 2
            blk = S[2*R:2*R+2, 4*Cc:4*Cc+4]; j = np.unravel_index(np.argmax(blk), blk.shape)
            if blk[j] < 0.15: continue
            rr = 2*R+j[0]; cc = 4*Cc+j[1]; q = idx[rr, cc]
            pts.append((cc, rr, C[q, 0], C[q, 1])); w.append(blk[j])
        if len(pts) >= 4: G = fit_affine(pts, np.array(w), G0, lam)
        good = [p for p, ww in zip(pts, w) if ww > 0.3]
        if len(good) >= 3:
            qs = [idx[p[1], p[0]] for p in good]
            aref = float(np.median(C[qs, 2])); cref = float(np.median(C[qs, 3]))
            aref = float(np.clip(aref, 4*k*k, 30*k*k)); cref = max(cref, 50.0)
            s = cscore(C, k, aref, cref)
    return G, s, cref

def decode_oriented(g):
    H, W = g.shape
    thm, k, sig = prep(g)
    C = candidates(thm, k); s = cscore(C, k)
    if len(C) < 3:
        return None
    s0 = s
    best = None
    for (v, t, ox, oy) in vote(C, s0, W, H, k):
        G, s1, cref = em_fit(C, s0, W, H, k, t, ox, oy)
        S, idx = cell_S(C, s1, G, k, 2.5)
        q = sum(S[2*(g_//2):2*(g_//2)+2, 4*(g_ % 2):4*(g_ % 2)+4].max() for g_ in range(8))
        if best is None or q > best[0]: best = (q, G, s1, cref, v, t)
    if best is None: return None
    q, G, s, cref, v, t = best
    S, idx = cell_S(C, s, G, k, 2.5)
    B, O = patch_feats(thm, G, k, max(30.0, OCC_REL*cref) if cref else 30.0)
    vis = [(r, c) for r in range(8) for c in range(8) if S[r, c] > 0.5]
    Bref = float(np.median([B[r, c] for r, c in vis])) if len(vis) >= 3 else 30.0
    Bn = 30.0*np.minimum(B/max(Bref, 3.0), 1.5)
    T = Bn+WS*S+WO*O
    digits = []; probs = []; best = []
    for reg in range(8):
        R = reg//2; Cc = reg % 2
        b = T[2*R:2*R+2, 4*Cc:4*Cc+4].reshape(-1)
        js = int(np.argmax(b)); rr = 2*R+js//4; cc = 4*Cc+js % 4
        tau = TAU if S[rr, cc] >= 0.3 else TAU_H   # 깨끗한 점이 없으면(가려진 점 추론) 보수적
        z = (b-b.max())/tau; p = np.exp(z)/np.exp(z).sum()
        j = int(np.argmax(b)); digits.append(j); probs.append(float(p[j])); best.append(float(b[j]))
    return dict(Bref=Bref, digits=digits, probs=probs, conf=float(np.prod(probs)), evidence=float(np.sum(best)),
                G=G, k=k, sig=sig, S=S, B=B, O=O, T=T, vote=v, ang=float(np.rad2deg(t)))

def decode(g):
    H, W = g.shape
    if W <= H:
        r = decode_oriented(g)
        if r is not None:
            r['orient'] = '0'; r['oyk'] = (r['G'][3]+r['G'][5]*4.0-H/2)/r['k']
            if r['oyk'] > -3: return r
    if W > H:
        cands = [('cw', cv2.rotate(g, cv2.ROTATE_90_CLOCKWISE)), ('ccw', cv2.rotate(g, cv2.ROTATE_90_COUNTERCLOCKWISE))]
    else:
        cands = [('0', g), ('180', cv2.rotate(g, cv2.ROTATE_180))]
    best = None
    for nm, gi in cands:
        r = decode_oriented(gi)
        if r is None: continue
        r['orient'] = nm
        # 180° 대칭: 점격자는 회전대칭이라 증거량이 같음 → 인쇄 오프셋(항상 +y, 아래쪽)으로 방향 판별
        r['oyk'] = (r['G'][3]+r['G'][5]*4.0 - gi.shape[0]/2)/r['k']
        if best is None or r['oyk'] > best['oyk']: best = r
    return best

def load(path):
    return cv2.imread(path, 0).astype(np.float32)
