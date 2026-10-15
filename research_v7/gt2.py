import cv2,numpy as np,json
def tris(ans,org,scale=1.0):
  a=cv2.imread(ans,0).astype(np.float32); o=cv2.imread(org,0).astype(np.float32)
  (dx,dy),r=cv2.phaseCorrelate(255-o,255-a)
  M=np.float32([[1,0,dx],[0,1,dy]]); o2=cv2.warpAffine(o,M,(o.shape[1],o.shape[0]),borderValue=255)
  o2e=cv2.erode(o2,np.ones((5,5),np.uint8))
  m=((a<140)&(o2e>170)).astype(np.uint8)
  m=cv2.dilate(m,np.ones((7,7),np.uint8))
  n,l,st,c=cv2.connectedComponentsWithStats(m)
  boxes=[]
  for k in range(1,n):
    x,y,w,h,ar=st[k]
    if ar>100*scale and w<150*scale and h<150*scale: boxes.append([x,y,x+w,y+h])
  merged=True
  while merged:
    merged=False
    for p in range(len(boxes)):
      for q in range(p+1,len(boxes)):
        A,B=boxes[p],boxes[q]
        if A[0]-30<B[2] and B[0]-30<A[2] and A[1]-30<B[3] and B[1]-30<A[3]:
          boxes[p]=[min(A[0],B[0]),min(A[1],B[1]),max(A[2],B[2]),max(A[3],B[3])]; boxes.pop(q); merged=True; break
      if merged: break
  boxes=[b for b in boxes if (b[2]-b[0])>40*scale and (b[3]-b[1])>30*scale]
  cs=[((b[0]+b[2])/2-dx,(b[1]+b[3])/2-dy) for b in boxes]
  return cs,o.shape
def digits(cs,shape):
  H,W=shape; D=[None]*8; cells=[]
  for x,y in cs:
    c=int(x/(W/8)); r=int(y/(H/8)); reg=(r//2)*2+c//4; d=(r%2)*4+c%4
    cells.append((r,c)); 
    if D[reg] is not None: D[reg]='!'
    else: D[reg]=d
  return D,cells
out={}
pairs=[(f'n{i}',f'n{i}_ans.jpg',f'n{i}_org.jpg',1.0) for i in range(1,9)]+[('s8','sample_8(답안지).jpg','sample_8(원본).jpg',1.36),('s9','sample_9(답안지).jpg','sample_9(출력본).jpg',1.36),('s11','sample_11(답안지).jpg','sample_11(출력본).jpg',1.36)]
for name,a,o,s in pairs:
  cs,sh=tris(a,o,s); D,cells=digits(cs,sh)
  print(name,len(cs),''.join(map(str,D)),sorted(cells))
  out[name]=dict(tri=cs,code=''.join(map(str,D)),org=o)
json.dump(out,open('gt.json','w'),indent=0)
