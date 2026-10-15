// usage: node jsrun.js block.js list.txt   (list: path w h per line) -> JSON lines
const fs=require('fs');
const [,,blockPath,list]=process.argv;
function toGrayFloat(imageData){const d=imageData.data,n=imageData.width*imageData.height,g=new Float32Array(n);for(let i=0;i<n;i++)g[i]=0.299*d[i*4]+0.587*d[i*4+1]+0.114*d[i*4+2];return g;}
global.toGrayFloat=toGrayFloat;const {analyzeV7}=new Function(fs.readFileSync(blockPath,'utf8')+';return {analyzeV7};')();
for(const line of fs.readFileSync(list,'utf8').trim().split('\n')){
  const [p,W,H,tag]=line.split(' ');
  const raw=fs.readFileSync(p); let data;
  if(raw.length===(+W)*(+H)){data=new Uint8ClampedArray(W*H*4);for(let i=0;i<W*H;i++){data[i*4]=data[i*4+1]=data[i*4+2]=raw[i];data[i*4+3]=255;}}
  else data=new Uint8ClampedArray(raw);
  const t=Date.now(); const r=analyzeV7({width:+W,height:+H,data});
  console.log(JSON.stringify({tag:tag||p,digits:r.digits,conf:r.confidence,mode:r.mode,probs:r.probs&&r.probs.map(x=>+x.toFixed(3)),ms:Date.now()-t}));
}
