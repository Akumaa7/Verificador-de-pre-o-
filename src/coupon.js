import {toCents} from './parser.js';
const ITEM=/^(?:\d{1,3}\s+)?(?:\d{6,14}\s+)?(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:UN|KG|PC)?\s*[xX]\s*(\d{1,4}[.,]\d{2})\s+(\d{1,5}[.,]\d{2})\s*$/i;
const DESC=/^DESC(?:ONTO)?\b.*?(\d{1,5}[.,]\d{2})\s*$/i;
const TOTAL=/TOTAL\s*(?:R\$)?\s*(\d{1,5}[.,]\d{2})\s*$/i;
export function parseCoupon(lines){
  const items=[];let total_cent=null;
  for(const raw of lines){const l=raw.trim();let m;
    if((m=ITEM.exec(l)))items.push({descricao:m[1].trim(),qtd:parseFloat(m[2].replace(',','.')),unit_cent:toCents(m[3]),total_cent:toCents(m[4]),desconto_cent:0,linha:l});
    else if(items.length&&(m=DESC.exec(l)))items.at(-1).desconto_cent+=toCents(m[1]);
    else if(!/SUB\s*TOTAL/i.test(l)&&(m=TOTAL.exec(l)))total_cent=toCents(m[1]);}
  return{items,total_cent,soma_itens_cent:items.reduce((s,i)=>s+i.total_cent-i.desconto_cent,0)};
}
export const nfceKey=t=>(/[?&]p=(\d{44})/.exec(t)||/\b(\d{44})\b/.exec(t)||[])[1]||null; // só extrai a chave; consulta online é opcional e não é feita
