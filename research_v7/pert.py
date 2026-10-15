import numpy as np,cv2,json,sys,os,importlib
v7f=importlib.import_module(os.environ.get("DEC","v7f"))
from evf import DOCS
from multiprocessing import Pool
rng=np.random.default_rng(0)
def rot(g,deg):
  H,W=g.shape;M=cv2.getRotationMatrix2D((W/2,H/2),deg,1.0)
  return cv2.warpAffine(g,M,(W,H),flags=cv2.INTER_LINEAR,borderValue=255)
def P(name,g,seed):
  r=np.random.default_rng(seed)
  if name=='clean': return g
  if name.startswith('rot'): return rot(g,float(name[3:]))
  if name.startswith('blur'): return cv2.GaussianBlur(g,(0,0),float(name[4:]))
  if name.startswith('noise'): return np.clip(g+r.normal(0,float(name[5:]),g.shape),0,255).astype(np.float32)
  if name.startswith('bright'): return np.clip(g+float(name[6:]),0,255)
  if name.startswith('contrast'): c=float(name[8:]); return np.clip(255-(255-g)*c,0,255)
  if name.startswith('jpeg'):
    ok,b=cv2.imencode('.jpg',g.astype(np.uint8),[cv2.IMWRITE_JPEG_QUALITY,int(name[4:])]); return cv2.imdecode(b,0).astype(np.float32)
  if name.startswith('scale'):
    s=float(name[5:]); return cv2.resize(g,None,fx=s,fy=s,interpolation=cv2.INTER_AREA)
  if name.startswith('shift'):
    d=int(name[5:]); H,W=g.shape; M=np.float32([[1,0,d],[0,1,d]]); return cv2.warpAffine(g,M,(W,H),borderValue=255)
  raise ValueError(name)
PERTS=['clean','rot0.5','rot-0.8','rot1.2','rot-1.5','blur0.7','blur1.0','blur1.3','noise6','noise12','bright-40','contrast0.6','jpeg40','scale0.82','scale0.65','shift8','shift-8']
def job(a):
  (n,f,code),p=a
  g=v7f.load(f); gi=P(p,g,hash(n+p)%1000)
  if p.startswith('shift'): # shift in 220dpi px units
    pass
  r=v7f.decode(gi); c=''.join(map(str,r['digits']))
  return n,p,code,c,r['conf'],r['probs']
if __name__=='__main__':
  tasks=[(d,p) for d in DOCS for p in PERTS]
  with Pool(8) as pool: res=pool.map(job,tasks)
  json.dump(res,open('pert_res.json','w'))
  import collections
  byp=collections.defaultdict(lambda:[0,0,0,0])
  for n,p,code,c,conf,probs in res:
    nd=sum(a==b for a,b in zip(c,code)); byp[p][0]+=c==code; byp[p][1]+=1; byp[p][2]+=nd; byp[p][3]+=8
  for p in PERTS: a=byp[p]; print('%-12s docs %2d/%2d digits %3d/%3d'%(p,a[0],a[1],a[2],a[3]))
  # calibration: digits with p>=0.9 accuracy
  hi=[];lo=[]
  for n,p,code,c,conf,probs in res:
    for i in range(8): (hi if probs[i]>=0.9 else lo).append(c[i]==code[i])
  print('digits p>=0.9: n=%d acc=%.4f | p<0.9: n=%d acc=%.3f'%(len(hi),np.mean(hi),len(lo),np.mean(lo)))
  th=[(conf>=0.5, c==code) for n,p,code,c,conf,probs in res]
  print('docs conf>=50%%: n=%d acc=%.3f; conf<50%%: n=%d acc=%.3f'%(sum(a for a,b in th),np.mean([b for a,b in th if a]),sum(not a for a,b in th),np.mean([b for a,b in th if not a])))
