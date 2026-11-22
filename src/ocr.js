// Contrato de motor: recognize(blob,{psm}) -> {engine,width,height,words:[{text,conf,bbox:{x0,y0,x1,y1}}]}
// A UI só conhece este contrato. Outro motor (ML Kit nativo, PaddleOCR/ONNX) entra implementando o mesmo método.
const loadScript=src=>new Promise((ok,err)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>err(new Error('não achei '+src));document.head.append(s)});
const abs=p=>new URL(p,location.href).href;

async function preprocess(blob){ // cinza + esticamento de contraste (1%-99%); sem filtros que inventem traço
  const bmp=await createImageBitmap(blob,{imageOrientation:'from-image'});
  const s=Math.min(1,2600/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0,c.width,c.height);
  const d=x.getImageData(0,0,c.width,c.height),p=d.data,hist=new Uint32Array(256);
  for(let i=0;i<p.length;i+=4){const g=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)|0;p[i]=p[i+1]=p[i+2]=g;hist[g]++}
  const n=c.width*c.height;let a=0,lo=0,hi=255;
  for(;lo<255&&(a+=hist[lo])<n*.01;lo++);a=0;for(;hi>0&&(a+=hist[hi])<n*.01;hi--);
  if(hi-lo>30)for(let i=0;i<p.length;i+=4){const v=Math.max(0,Math.min(255,(p[i]-lo)*255/(hi-lo)));p[i]=p[i+1]=p[i+2]=v}
  x.putImageData(d,0,0);return c;
}

export class TesseractEngine{
  name='tesseract.js 5.1.1 (WASM, por)';
  async init(){
    if(this.worker)return;
    await loadScript('vendor/tesseract.min.js');
    this.worker=await Tesseract.createWorker('por',1,{workerPath:abs('vendor/worker.min.js'),corePath:abs('vendor/core'),langPath:abs('vendor/lang'),cacheMethod:'none'});
  }
  async recognize(blob,{psm=11}={}){ // 11 = texto esparso (etiquetas); 6 = bloco uniforme (cupom)
    await this.init();
    await this.worker.setParameters({tessedit_pageseg_mode:String(psm)});
    const img=await preprocess(blob);
    const {data}=await this.worker.recognize(img); // roda no Worker do Tesseract: UI não trava
    const words=data.words.filter(w=>w.text.trim()).map(w=>({text:w.text,conf:w.confidence,bbox:{...w.bbox}}));
    return{engine:this.name,width:img.width,height:img.height,words};
  }
}
