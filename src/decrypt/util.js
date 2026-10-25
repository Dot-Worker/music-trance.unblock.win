import CryptoJS from 'crypto-js';
export class DecryptError extends Error { constructor(code,message){super(message);this.name='DecryptError';this.code=code;} }
export function fail(code,message){throw new DecryptError(code,message);}
export const utf8=s=>new TextEncoder().encode(s);
export const str=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
export function starts(b,p,off=0){if(typeof p==='string')p=utf8(p);return off>=0&&b.length>=off+p.length&&p.every((x,i)=>b[off+i]===x);}
export function bounds(b,p,n){if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>b.length)fail('INVALID_FILE','文件截断或长度字段无效。');}
export function u32(b,p,le=true){bounds(b,p,4);return new DataView(b.buffer,b.byteOffset+p,4).getUint32(0,le);}
export function wa(b){return CryptoJS.lib.WordArray.create(b);}
export function bytes(w){const b=new Uint8Array(w.sigBytes);for(let i=0;i<b.length;i++)b[i]=(w.words[i>>>2]>>>(24-(i%4)*8))&255;return b;}
export function base64(b){let s=typeof b==='string'?b:str(b);s=s.trim();if(!s||!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length%4===1)fail('INVALID_KEY','文件内嵌密钥编码无效。');return bytes(CryptoJS.enc.Base64.parse(s));}
export function aes(b,key,{iv,padded=true}={}){if(!b.length||b.length%16)fail('INVALID_FILE','AES 数据长度无效。');const p=bytes(CryptoJS.AES.decrypt({ciphertext:wa(b)},wa(key),{mode:iv?CryptoJS.mode.CBC:CryptoJS.mode.ECB,iv:iv?wa(iv):undefined,padding:CryptoJS.pad.NoPadding}));if(!padded)return p;const n=p.at(-1);if(n<1||n>16||p.subarray(p.length-n).some(x=>x!==n))fail('INVALID_KEY','AES 填充校验失败。');return p.slice(0,-n);}
export {CryptoJS};
