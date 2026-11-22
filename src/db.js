const open=()=>new Promise((res,rej)=>{const r=indexedDB.open('verificador',1);r.onupgradeneeded=()=>{for(const s of['labels','coupons','corrections'])r.result.createObjectStore(s,{keyPath:'id',autoIncrement:true})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const tx=async(s,mode,fn)=>{const d=await open();return new Promise((res,rej)=>{const t=d.transaction(s,mode);const q=fn(t.objectStore(s));t.oncomplete=()=>res(q.result);t.onerror=()=>rej(t.error)})};
export const put=(s,v)=>tx(s,'readwrite',o=>o.put(v));
export const all=s=>tx(s,'readonly',o=>o.getAll());
export const persist=()=>navigator.storage?.persist?.();
