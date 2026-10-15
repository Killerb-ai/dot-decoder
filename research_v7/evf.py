import json,numpy as np,time,sys,os
import importlib; v7f=importlib.import_module(os.environ.get("DEC","v7f"))
GT=json.load(open('gt.json'));GT['s9']['code']='26174411';GT['n8']['code']='45616046'
DOCS=[(n,g['org'],g['code']) for n,g in GT.items()]+[('s6','sample_6(원본).jpg','56161270'),('s7','sample_7(원본).jpg','35261270')]
if __name__=='__main__':
  ok=0;dok=0
  for n,f,code in DOCS:
    t=time.time(); r=v7f.decode(v7f.load(f)); c=''.join(map(str,r['digits']))
    nd=sum(a==b for a,b in zip(c,code)); dok+=nd; ok+=c==code
    print(n,code,c,'OK' if c==code else 'XX',nd,'conf %.0f%%'%(100*r['conf']),r['orient'],'ang %.2f'%r['ang'],'ev %.0f'%r['evidence'],np.round(r['probs'],2),'%.1fs'%(time.time()-t))
  print('docs',ok,'/',len(DOCS),'digits',dok,'/',8*len(DOCS))
