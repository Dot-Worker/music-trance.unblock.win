/** Header detection is a hint only, never a claim of full decode validity. */
export function sniffAudio(bytes) {
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const text=(o,n)=>String.fromCharCode(...b.subarray(o,o+n));
 if(b.length>=12&&text(0,4)==='RIFF'&&text(8,4)==='WAVE') return 'wav';
 if(text(0,4)==='fLaC') return 'flac';
 if(text(0,4)==='OggS') return 'ogg';
 if(text(0,3)==='ID3') return 'mp3';
 if(b.length>=12&&text(4,4)==='ftyp') return 'm4a';
 if(b.length>=2&&b[0]===255&&(b[1]&0xf6)===0xf0) return 'aac';
 if(b.length>=2&&b[0]===255&&(b[1]&0xe0)===0xe0) return 'mp3';
 return null;
}
export function parseWav(bytes) {
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(sniffAudio(b)!=='wav') throw new Error('Not a RIFF/WAVE file.');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 let fmt=null,dataBytes=0;
 for(let p=12;p+8<=b.length;) {
  const tag=String.fromCharCode(...b.subarray(p,p+4)),len=v.getUint32(p+4,true),start=p+8;
  if(start+len>b.length) throw new Error('Truncated WAV chunk.');
  if(tag==='fmt '&&len>=16) fmt={format:v.getUint16(start,true),channels:v.getUint16(start+2,true),sampleRate:v.getUint32(start+4,true),bitsPerSample:v.getUint16(start+14,true)};
  if(tag==='data') dataBytes+=len;
  p=start+len+(len&1);
 }
 if(!fmt) throw new Error('Missing WAV format chunk.');
 return {...fmt,dataBytes};
}
