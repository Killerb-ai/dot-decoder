import numpy as np,cv2,json,subprocess,os,sys
os.environ['DEC']='v71'
import pert
from evf import DOCS
GT={n:c for n,f,c in DOCS}
out=[]
for p in pert.PERTS:
  L=[]
  for n,f,code in DOCS:
    g=pert.P(p,pert.v7f.load(f),hash(n+p)%1000); g=np.clip(np.round(g),0,255).astype(np.uint8)
    fn=f'/tmp/raw/p_{n}.gray'; open(fn,'wb').write(g.tobytes()); L.append(f'{fn} {g.shape[1]} {g.shape[0]} {n}')
  open('/tmp/raw/pl.txt','w').write('\n'.join(L))
  res=subprocess.run(['node','jsrun.js','v7_block.js','/tmp/raw/pl.txt'],capture_output=True,text=True).stdout.strip().split('\n')
  d=0;ok=0
  for l in res:
    r=json.loads(l); c=''.join(map(str,r['digits'])) if r['digits'] else '????????'; g=GT[r['tag']]
    ok+=c==g; d+=sum(a==b for a,b in zip(c,g)); out.append((r['tag'],p,g,c,r['conf'],r['probs']))
  print('%-12s docs %2d/13 digits %3d/104'%(p,ok,d),flush=True)
json.dump(out,open('jspert_res.json','w'))
hi=[];lo=[]
for n,p,g,c,conf,probs in out:
  if probs:
    for i in range(8): (hi if probs[i]>=0.9 else lo).append(c[i]==g[i])
print('digits p>=0.9: n=%d acc=%.4f | p<0.9: n=%d acc=%.3f'%(len(hi),np.mean(hi),len(lo),np.mean(lo)))
