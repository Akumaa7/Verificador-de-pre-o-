import {TesseractEngine} from './ocr.js';
import {interpret,groupLines,toCents} from './parser.js';
import {parseCoupon,nfceKey} from './coupon.js';
import {match,compareItem} from './compare.js';
import {put,all,persist} from './db.js';

const ocr=new TesseractEngine(),$=s=>document.querySelector(s);
const h=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a))x.startsWith('on')?e.addEventListener(x.slice(2),v):e.setAttribute(x,v);e.append(...k.filter(v=>v!=null&&v!==false));return e};
const brl=c=>c==null?'—':(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const say=m=>$('#status').textContent=m;
const val=v=>v==null?'':String(v).replace('.',',');
const num=v=>{v=v.trim();if(!v)return null;const c=toCents(v);if(Number.isNaN(c))throw new Error('Valor inválido: '+v);return c/100};
let current=null;

document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  for(const s of['etq','cup','his'])$('#'+s).hidden=s!==b.dataset.t;
  if(b.dataset.t==='his')renderHist();}));

async function offlineReady(){const ok=await caches?.match('vendor/lang/por.traineddata.gz');
  say(ok?'Modelos locais: ok. Funciona sem internet.':'Modelos locais ausentes: rode "npm run vendor" e abra online uma vez.')}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').then(()=>setTimeout(offlineReady,1500)).catch(()=>offlineReady());
persist();

// ---------- Etiqueta ----------
$('#foto').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;say('Lendo etiqueta…');
  try{const raw=await ocr.recognize(file,{psm:11});current={file,raw,interp:interpret(raw.words)};renderLabel();say('Confira os valores e confirme.')}
  catch(err){say('Falha no OCR: '+err.message)}
  e.target.value='';
});

function renderLabel(){
  const {file,interp:i}=current,box=$('#resultado');box.replaceChildren();
  const main=i.preco_promocional??i.preco_normal;
  const F={descricao_original:i.descricao_original||'',volume:i.volume||'',preco_normal:val(i.preco_normal),preco_promocional:val(i.preco_promocional),preco_unit:val(i.preco_por_unidade?.valor),quantidade_minima:i.quantidade_minima??''};
  const inp=Object.fromEntries(Object.entries(F).map(([k,v])=>[k,h('input',{value:v,inputmode:k.startsWith('preco')||k==='quantidade_minima'?'decimal':'text'})]));
  const cond=h('textarea',{rows:2},i.condicoes_promocao.join('\n'));
  const card=h('div',{class:'card'},
    h('img',{class:'th',src:URL.createObjectURL(file),alt:'Foto da etiqueta'}),
    main!=null&&h('div',{},h('div',{class:'mut'},i.preco_promocional!=null?'Preço promocional':'Preço normal',i.origem[i.preco_promocional!=null?'preco_promocional':'preco_normal']==='inferido'?' (inferido)':''),h('div',{class:'preco'},brl(Math.round(main*100)))),
    i.confianca<.7&&h('p',{class:'warn'},`Confiança baixa (${Math.round(i.confianca*100)}%): confira com a etiqueta.`),
    ...i.ambiguidades.map(a=>h('div',{},h('p',{class:'warn'},'Não deu para saber qual é o normal e qual é o promocional. Toque para escolher:'),
      ...a.opcoes.flatMap(v=>[h('button',{class:'s',onclick:()=>{inp.preco_promocional.value=val(v)}},`${brl(v*100)} é promocional`),h('button',{class:'s',onclick:()=>{inp.preco_normal.value=val(v)}},`${brl(v*100)} é normal`)]))),
    ...[['descricao_original','Descrição'],['volume','Volume'],['preco_normal','Preço normal (R$)'],['preco_promocional','Preço promocional (R$)'],['preco_unit',`Preço por ${i.preco_por_unidade?.unidade||'kg/L/un'} (R$)`],['quantidade_minima','Quantidade mínima para a promoção']].map(([k,t])=>h('label',{},t,inp[k])),
    h('label',{},'Condições da promoção (uma por linha)',cond),
    i.ignorados.length>0&&h('p',{class:'mut'},'Ignorado (não é preço de venda): '+i.ignorados.map(x=>x.texto).join('; ')),
    h('button',{class:'p',onclick:save},'Confirmar e salvar'));
  box.append(card);
  async function save(){
    try{
      const pu=num(inp.preco_unit.value),f={...i,descricao_original:inp.descricao_original.value.trim()||null,volume:inp.volume.value.trim()||null,
        preco_normal:num(inp.preco_normal.value),preco_promocional:num(inp.preco_promocional.value),
        preco_por_unidade:pu==null?null:{valor:pu,unidade:i.preco_por_unidade?.unidade||'unidade'},
        quantidade_minima:inp.quantidade_minima.value?+inp.quantidade_minima.value:null,
        condicoes_promocao:cond.value.split('\n').map(s=>s.trim()).filter(Boolean),ambiguidades:[],campos_confirmados:true};
      f.produto=f.descricao_original&&f.descricao_original.toLowerCase().replace(/^\w/,c=>c.toUpperCase());
      const id=await put('labels',{criadoEm:Date.now(),foto:file,ocr_bruto:current.raw,interpretacao_inicial:i,final:f,confirmado:true});
      const pick=o=>JSON.stringify([o.descricao_original,o.volume,o.preco_normal,o.preco_promocional,o.preco_por_unidade?.valor,o.quantidade_minima,o.condicoes_promocao]);
      if(pick(f)!==pick(i))await put('corrections',{labelId:id,criadoEm:Date.now(),interpretacao_inicial:i,campos_corrigidos:f});
      box.replaceChildren(h('p',{class:'ok'},'Etiqueta salva.'));say('Salvo no aparelho.');current=null;
    }catch(err){say(err.message)}
  }
}

// ---------- Cupom ----------
let cup=null;
$('#fcup').addEventListener('change',async e=>{
  const files=[...e.target.files];if(!files.length)return;
  try{const lines=[],raws=[];let qr=null;
    for(const [n,f] of files.entries()){say(`Lendo parte ${n+1} de ${files.length}…`);
      const r=await ocr.recognize(f,{psm:6});raws.push(r);lines.push(...groupLines(r.words).map(l=>l.text));
      if(!qr&&'BarcodeDetector'in window){try{const d=await new BarcodeDetector({formats:['qr_code']}).detect(await createImageBitmap(f));qr=d[0]?.rawValue||null}catch{}}}
    const labels=(await all('labels')).filter(l=>l.confirmado);
    cup={files,raws,parsed:parseCoupon(lines),qr,labels,sel:{}};
    cup.parsed.items.forEach((it,k)=>{const m=match(it.descricao,labels);cup.sel[k]=m.decisao==='nenhum'?-1:labels.indexOf(m.label)});
    await put('coupons',{criadoEm:Date.now(),fotos:files,ocr_bruto:raws,linhas:lines,interpretado:cup.parsed,qr:cup.qr,chave_nfce:cup.qr&&nfceKey(cup.qr)});
    renderCup();say('Cupom lido e salvo.');
  }catch(err){say('Falha ao ler cupom: '+err.message)}
  e.target.value='';
});
$('#cond').addEventListener('change',()=>cup&&renderCup());

function renderCup(){
  const box=$('#cupres');box.replaceChildren();const {parsed:p,labels}=cup;let div=0;
  if(!p.items.length){box.append(h('p',{class:'warn'},'Nenhum item reconhecido. Fotografe de perto, com o cupom esticado.'));return}
  box.append(h('div',{class:'card'},`Total no cupom: ${brl(p.total_cent)} · Soma dos itens lidos: ${brl(p.soma_itens_cent)}`,
    p.total_cent!=null&&p.total_cent!==p.soma_itens_cent&&h('p',{class:'warn'},'A soma não bate com o total: algum item pode não ter sido lido.'),
    cup.qr&&h('p',{class:'mut'},'QR Code lido (consulta online não realizada): '+(nfceKey(cup.qr)||cup.qr))));
  p.items.forEach((it,k)=>{
    const sel=h('select',{},h('option',{value:-1},'Sem etiqueta correspondente'),...labels.map((l,j)=>h('option',{value:j},`${l.final.descricao_original||'?'} ${l.final.volume||''}`)));
    sel.value=cup.sel[k];sel.addEventListener('change',()=>{cup.sel[k]=+sel.value;renderCup()});
    const l=labels[cup.sel[k]],r=l&&compareItem(l.final,it,{condicoesCumpridas:$('#cond').checked});
    if(r&&r.status==='divergente')div+=r.divergencia_total_cent;
    const msg={ok:['ok','Preço confere'],abaixo:['ok','Cobrado a menos que o anunciado'],divergente:['bad',`Divergência: ${brl(r?.divergencia_total_cent)}`],condicional:['warn',`Possível divergência de ${brl(r?.divergencia_total_cent)} (promoção com condições)`],sem_preco:['warn','Etiqueta sem preço']}[r?.status]||['mut','Escolha a etiqueta correspondente'];
    box.append(h('div',{class:'card'},h('strong',{},`${it.qtd}× ${it.descricao}`),h('div',{class:'mut'},`Cobrado ${brl(it.unit_cent)} por unidade${it.desconto_cent?` (desconto ${brl(it.desconto_cent)})`:''}`),sel,
      r&&r.anunciado_cent!=null&&h('div',{class:'mut'},`Anunciado ${brl(r.anunciado_cent)} (${r.tipo}) · cobrado ${brl(r.cobrado_cent)} · diferença por unidade ${brl(r.dif_unit_cent)}`),
      h('div',{class:msg[0]},msg[1]),...(r?.notas||[]).map(n=>h('div',{class:'mut'},n))));
  });
  box.prepend(h('div',{class:'card'},h('div',{class:'mut'},'Divergência confirmada (sem condições pendentes)'),h('div',{class:'preco'},brl(div))));
}

// ---------- Histórico ----------
$('#busca').addEventListener('input',renderHist);
async function renderHist(){
  const q=$('#busca').value.toLowerCase(),box=$('#lista');box.replaceChildren();
  const ls=(await all('labels')).sort((a,b)=>b.criadoEm-a.criadoEm).filter(l=>(l.final.descricao_original||'').toLowerCase().includes(q));
  if(!ls.length)box.append(h('p',{class:'mut'},'Nenhuma etiqueta salva ainda. Fotografe uma na aba Etiqueta.'));
  for(const l of ls){const f=l.final;
    box.append(h('div',{class:'card'},h('strong',{},`${f.descricao_original||'Sem descrição'} ${f.volume||''}`),
      h('div',{},f.preco_promocional!=null?`Promo ${brl(f.preco_promocional*100)} · normal ${brl(f.preco_normal==null?null:f.preco_normal*100)}`:`Normal ${brl(f.preco_normal==null?null:f.preco_normal*100)}`),
      f.condicoes_promocao.length>0&&h('div',{class:'warn'},f.condicoes_promocao.join('; ')),h('div',{class:'mut'},new Date(l.criadoEm).toLocaleString('pt-BR')),
      h('button',{class:'s',onclick:()=>{const a=h('a',{href:URL.createObjectURL(new Blob([JSON.stringify({words:l.ocr_bruto.words,esperado:{preco_normal:f.preco_normal,preco_promocional:f.preco_promocional}})],{type:'application/json'})),download:`caso-${l.id}.json`});a.click()}},'Exportar caso para teste')));
  }
}
