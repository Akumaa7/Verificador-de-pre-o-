// Interpretação determinística de etiqueta a partir de palavras com coordenadas.
const MONEY=/^(?:R\$)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,4}[.,]\d{2})$/i;
export const nrm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export const toCents=s=>{s=String(s).replace(/^R\$/i,'').trim();const n=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;return Math.round(parseFloat(n)*100)};
const U='(KG|QUILO|LITRO|LT|L|UNID|UN|100\\s*G|G)';
const AFTER=new RegExp('^(?:/|P/|POR)\\s*'+U+'\\b');
const BEFORE=new RegExp('(?:\\bPOR\\s*|\\bP/\\s*|R\\$/\\s*|\\bPRECO\\s+)'+U+'\\s*:?\\s*$');
const unitName=k=>/^(KG|QUILO|G|100G)$/.test(k)?'kg':/^(L|LT|LITRO)$/.test(k)?'litro':'unidade';
const COND=/CLUBE|CADASTR|FIDELIDADE|\bAPP\b|APLICATIVO|CARTAO|MEMBRO|LEVE\s*\d+|\d+\s*OU\s*MAIS|A PARTIR DE|ACIMA DE|\bMIN(IMO)?\b/;
const EXCL=/ECONOMI|DESCONTO|\bCOD\b|\bREF\b/;
const VOL=/(\d+(?:[.,]\d+)?)\s*(KG|G|ML|LT|L|LITROS?)\b/;

export function groupLines(words){
  const ws=words.filter(w=>w.text.trim()).map(w=>({...w,cy:(w.bbox.y0+w.bbox.y1)/2,h:w.bbox.y1-w.bbox.y0})).sort((a,b)=>a.cy-b.cy),lines=[];
  for(const w of ws){const l=lines.find(l=>Math.abs(l.cy-w.cy)<Math.max(l.h,w.h)*.5);
    if(l){l.words.push(w);l.cy=(l.cy*(l.words.length-1)+w.cy)/l.words.length;l.h=Math.max(l.h,w.h)}else lines.push({words:[w],cy:w.cy,h:w.h})}
  for(const l of lines){l.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);l.text=l.words.map(w=>w.text).join(' ')}
  return lines.sort((a,b)=>a.cy-b.cy);
}

export function interpret(words){
  const lines=groupLines(words),cands=[],units=[],ignorados=[],origem={};
  lines.forEach((ln,li)=>ln.words.forEach((w,wi)=>{
    const m=MONEY.exec(w.text.replace(/\s/g,''));if(!m)return;
    const before=[],after=[];
    for(let i=wi-1;i>=0&&before.length<3;i--){const t=nrm(ln.words[i].text);if(MONEY.test(t))break;if(t!=='R$')before.unshift(t)}
    for(let i=wi+1;i<ln.words.length&&after.length<3;i++){const t=nrm(ln.words[i].text);if(MONEY.test(t))break;after.push(t)}
    const b=before.join(' '),a=after.join(' ');
    if(EXCL.test(b)){ignorados.push({texto:ln.text,motivo:'não é preço de venda'});return}
    const c={w,cents:toCents(m[1]),h:w.h};
    const um=BEFORE.exec(b)||AFTER.exec(a);
    if(um){c.unit=unitName(um[1].replace(/\s/g,''));units.push(c);return}
    const last=before.at(-1)||'';
    c.hint=/^(DE|ANTES|NORMAL)$/.test(last)?'normal':/^(POR|OFERTA|PROMO|PROMOCAO)$/.test(last)?'promo':null;
    cands.push(c);
  }));
  const todo=nrm(lines.map(l=>l.text).join(' | '));
  let normal=null,promo=null;const amb=[],ambOpts=()=>({campo:'preco',opcoes:cands.map(c=>c.cents/100)});
  const sorted=[...cands].sort((a,b)=>b.h-a.h);
  if(cands.length>2)amb.push(ambOpts());
  else if(cands.length===1){const c=cands[0];
    if(c.hint==='promo'||/OFERTA|PROMO/.test(todo)){promo=c;origem.preco_promocional=c.hint?'reconhecido':'inferido'}
    else{normal=c;origem.preco_normal=c.hint?'reconhecido':'inferido'}}
  else if(cands.length===2){
    const hn=cands.find(c=>c.hint==='normal'),hp=cands.find(c=>c.hint==='promo'),[a,b]=sorted;
    if(hn&&hp&&hn!==hp){normal=hn;promo=hp;origem.preco_normal=origem.preco_promocional='reconhecido'}
    else if(hn||hp){const o=cands.find(c=>c!==(hn||hp)),[n,p]=hn?[hn,o]:[o,hp];
      if(p.cents<n.cents){normal=n;promo=p;origem.preco_normal=hn?'reconhecido':'inferido';origem.preco_promocional=hp?'reconhecido':'inferido'}else amb.push(ambOpts())}
    else if(a.h/Math.max(b.h,1)>=1.3&&a.cents<b.cents){promo=a;normal=b;origem.preco_normal=origem.preco_promocional='inferido'}
    else amb.push(ambOpts()); // alturas parecidas, ou o maior é o mais caro: não assumir
  }
  const unit=units[0]||null;
  const textLines=lines.filter(l=>{const t=nrm(l.text);return !l.words.some(w=>MONEY.test(w.text))&&!COND.test(t)&&!/\/\s*(KG|L)\b/.test(t)&&(t.match(/[A-Z]/g)||[]).length>=3&&(t.match(/[A-Z]/g)||[]).length/t.length>.5});
  const desc=textLines.slice(0,2).map(l=>l.text).join(' ')||null;
  const vm=VOL.exec(nrm(desc||''))||VOL.exec(todo);
  const volume=vm?`${vm[1].replace(',','.')} ${/^(L|LT|LITROS?)$/.test(vm[2])?'L':vm[2].toLowerCase()}`:null;
  const condLines=lines.filter(l=>COND.test(nrm(l.text))).map(l=>l.text);
  const qm=/LEVE\s*(\d+)|A PARTIR DE\s*(\d+)|(\d+)\s*OU\s*MAIS/.exec(todo);
  const used=[normal,promo,unit].filter(Boolean).map(c=>c.w.conf);
  let conf=used.length?used.reduce((s,x)=>s+x,0)/used.length/100:0;
  if(amb.length)conf*=.6;if(Object.values(origem).includes('inferido'))conf*=.9;
  const ev=(c)=>c&&{texto:c.w.text,bbox:c.w.bbox};
  return{
    produto:desc&&desc.toLowerCase().replace(/^\w/,c=>c.toUpperCase()),descricao_original:desc,volume,
    preco_normal:normal&&normal.cents/100,preco_promocional:promo&&promo.cents/100,
    preco_por_unidade:unit&&{valor:unit.cents/100,unidade:unit.unit},
    unidade_venda:!normal&&!promo&&unit?unit.unit:'unidade',
    quantidade_minima:qm?+(qm[1]||qm[2]||qm[3]):null,condicoes_promocao:condLines,
    ignorados,ambiguidades:amb,confianca:+conf.toFixed(2),campos_confirmados:false,origem,
    evidencias:{preco_normal:ev(normal),preco_promocional:ev(promo),preco_por_unidade:ev(unit)}
  };
}
