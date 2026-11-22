import {nrm} from './parser.js';
const ABBR={INT:'INTEGRAL',DESN:'DESNATADO',SEMI:'SEMIDESNATADO',REFRIG:'REFRIGERANTE',BISC:'BISCOITO',SAB:'SABONETE',DET:'DETERGENTE',CHOC:'CHOCOLATE',ACUC:'ACUCAR',MARG:'MARGARINA',QJO:'QUEIJO',TRAD:'TRADICIONAL',GFA:'GARRAFA'};
const STOP=new Set(['DE','DA','DO','C','COM','E','UN','UND','PCT','CX']);
const VOLG=/(\d+(?:[.,]\d+)?)\s*(KG|G|ML|LT|L|LITROS?)\b/g;
export function volumeOf(s){const m=new RegExp(VOLG.source).exec(nrm(s));if(!m)return null;const n=parseFloat(m[1].replace(',','.'));
  return /^(KG|G)$/.test(m[2])?Math.round(n*(m[2]==='KG'?1000:1))+'g':Math.round(n*(/^(ML)$/.test(m[2])?1:1000))+'ml'}
const tokens=s=>nrm(s).replace(VOLG,' ').split(/[^A-Z0-9]+/).filter(Boolean).map(t=>ABBR[t]||t).filter(t=>!STOP.has(t));
const tm=(a,b)=>a===b||(Math.min(a.length,b.length)>=3&&(a.startsWith(b)||b.startsWith(a)));
export function similarity(a,b){
  const va=volumeOf(a),vb=volumeOf(b);if(va&&vb&&va!==vb)return{score:0,motivo:'volume diferente'};
  const A=tokens(a),B=tokens(b);if(!A.length||!B.length)return{score:0};
  const hit=A.filter(x=>B.some(y=>tm(x,y))).length;let score=hit/(A.length+B.length-hit);
  if(!!va!==!!vb)score=Math.min(score,.69); // volume só de um lado: pedir confirmação
  return{score:+score.toFixed(2)};
}
export function match(descricao,labels){
  let best={label:null,score:0};
  for(const l of labels){const s=similarity(descricao,`${l.final.descricao_original||''} ${l.final.volume||''}`).score;if(s>best.score)best={label:l,score:s}}
  return{...best,decisao:best.score>=.7?'auto':best.score>=.4?'confirmar':'nenhum'};
}
const cents=v=>v==null?null:Math.round(v*100);
export function compareItem(f,item,opts={}){
  const n=cents(f.preco_normal),p=cents(f.preco_promocional),qty=item.qtd,notas=[];
  let esp=p??n,tipo=p!=null?'promocional':'normal';
  if(p!=null&&f.quantidade_minima&&qty<f.quantidade_minima){esp=n;tipo='normal';notas.push(`A promoção exige ${f.quantidade_minima} unidades; foram ${qty}.`)}
  if(esp==null)return{status:'sem_preco',notas};
  const cobrado=item.desconto_cent?Math.round((item.total_cent-item.desconto_cent)/qty):item.unit_cent;
  const dif=cobrado-esp;let status=dif>0?'divergente':dif<0?'abaixo':'ok';
  if(status==='divergente'&&tipo==='promocional'&&f.condicoes_promocao?.length&&!opts.condicoesCumpridas){
    status='condicional';notas.push('A promoção tem condições: '+f.condicoes_promocao.join('; ')+'. Confirme se você as cumpre antes de contestar.')}
  return{status,tipo,anunciado_cent:esp,cobrado_cent:cobrado,dif_unit_cent:dif,qtd:qty,divergencia_total_cent:Math.round(dif*qty),notas};
}
