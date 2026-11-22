import test from 'node:test';import assert from 'node:assert/strict';
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {interpret} from '../src/parser.js';import {similarity,compareItem,match} from '../src/compare.js';import {parseCoupon,nfceKey} from '../src/coupon.js';
const W=(text,x,y,h,conf=90)=>({text,conf,bbox:{x0:x,y0:y,x1:x+text.length*h*.6,y1:y+h}});
const row=(arr,x,y,h)=>{let cx=x;return arr.map(t=>{const w=W(t,cx,y,h);cx=w.bbox.x1+8;return w})};
const leite=()=>[...row(['LEITE','INT','UHT','1L'],20,20,20),...row(['DE','5,99'],20,100,20),...row(['POR','R$','4,79'],20,150,90).map((w,i)=>i<2?{...w,bbox:{...w.bbox,y0:175,y1:205}}:w),
  ...row(['R$','4,79','/','L'],20,260,18),...row(['CLUBE','EXIGE','CADASTRO'],20,300,18)];

test('etiqueta: normal, promocional, unitário, condição',()=>{
  const r=interpret(leite());
  assert.equal(r.preco_normal,5.99);assert.equal(r.preco_promocional,4.79);
  assert.deepEqual(r.preco_por_unidade,{valor:4.79,unidade:'litro'});
  assert.equal(r.descricao_original,'LEITE INT UHT 1L');assert.equal(r.volume,'1 L');
  assert.ok(r.condicoes_promocao[0].includes('CADASTRO'));assert.equal(r.origem.preco_promocional,'reconhecido');
  assert.equal(r.campos_confirmados,false);assert.equal(r.ambiguidades.length,0);
});
test('preço por kg não vira preço de venda',()=>{
  const r=interpret([...row(['PRESUNTO','FATIADO'],20,20,24),...row(['PREÇO','POR','KG','R$','12,90'],20,100,30)]);
  assert.equal(r.preco_normal,null);assert.deepEqual(r.preco_por_unidade,{valor:12.9,unidade:'kg'});assert.equal(r.unidade_venda,'kg');
});
test('ambiguidade: dois preços de mesma altura sem marcador',()=>{
  const r=interpret([...row(['ARROZ','TIPO','1','5KG'],20,20,20),...row(['22,90'],20,100,60),...row(['19,90'],200,100,60)]);
  assert.equal(r.preco_normal,null);assert.equal(r.preco_promocional,null);assert.equal(r.ambiguidades.length,1);
});
test('economia não é preço de venda',()=>{
  const r=interpret([...row(['SABAO','EM','PO'],20,20,20),...row(['R$','8,50'],20,100,60),...row(['ECONOMIZE','1,20'],20,200,18)]);
  assert.equal(r.preco_normal,8.5);assert.equal(r.ignorados.length,1);
});
test('similaridade: abreviação sim, volume diferente não',()=>{
  assert.ok(similarity('LEITE INTEGRAL UHT 1L','LEITE INT UHT 1L').score>=.7);
  assert.equal(similarity('LEITE INT 1L','LEITE INT 200ML').score,0);
  assert.ok(similarity('LEITE INT UHT','LEITE INT UHT 1L').score<.7);
});
test('comparação: 2 × 5,99 contra 4,79',()=>{
  const item={qtd:2,unit_cent:599,total_cent:1198,desconto_cent:0};
  const base={preco_normal:5.99,preco_promocional:4.79,condicoes_promocao:[]};
  const a=compareItem(base,item);assert.equal(a.status,'divergente');assert.equal(a.dif_unit_cent,120);assert.equal(a.divergencia_total_cent,240);
  const f={...base,condicoes_promocao:['Exige cadastro']};
  assert.equal(compareItem(f,item).status,'condicional');
  assert.equal(compareItem(f,item,{condicoesCumpridas:true}).status,'divergente');
  assert.equal(compareItem({...base,quantidade_minima:3},item).status,'ok');
});
test('cupom e associação',()=>{
  const c=parseCoupon(['001 7891234567890 LEITE INT UHT 1L 2 UN x 5,99 11,98','DESCONTO -1,00','002 7890000000001 ARROZ 5KG 1 UN x 24,90 24,90','SUBTOTAL 36,88','VALOR TOTAL R$ 35,88']);
  assert.equal(c.items.length,2);assert.equal(c.items[0].desconto_cent,100);assert.equal(c.total_cent,3588);assert.equal(c.soma_itens_cent,3588);
  assert.equal(match(c.items[0].descricao,[{final:{descricao_original:'LEITE INT UHT',volume:'1 L'}}]).decisao,'auto');
  assert.equal(nfceKey('https://x/qr?p='+'1'.repeat(44)+'|2|1'),'1'.repeat(44));
});
test('bench: casos reais em test/cases/',()=>{
  const d=new URL('./cases/',import.meta.url);if(!existsSync(d))return;
  const fs=readdirSync(d).filter(f=>f.endsWith('.json'));let ok=0;
  for(const f of fs){const c=JSON.parse(readFileSync(new URL(f,d)));const r=interpret(c.words);
    const hit=r.preco_normal===(c.esperado.preco_normal??null)&&r.preco_promocional===(c.esperado.preco_promocional??null);ok+=hit;if(!hit)console.log('  falhou:',f)}
  if(fs.length)console.log(`  acerto normal/promocional: ${ok}/${fs.length}`);
});
