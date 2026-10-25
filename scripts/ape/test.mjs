import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { validateApeWav } from '../../src/audio/ape-wav.js'
const require = createRequire(import.meta.url)
globalThis.self = { location: { href: 'file:///ffmpeg-core.js' } }
const wasm = await readFile(new URL('../../artifacts/ape/ape.wasm', import.meta.url))
globalThis.require = require
globalThis.__dirname = new URL('../../artifacts/ape/',import.meta.url).pathname
const {default:createApeEncoder}=await import('../../artifacts/ape/ape.js')
const ape = await createApeEncoder({ wasmBinary: wasm })
const ff = await require('../../artifacts/core/ffmpeg-core.cjs')({wasmBinary:await readFile(new URL('../../artifacts/core/test-core.wasm',import.meta.url))})
const logs=[];ff.setLogger(({message})=>logs.push(message))
export function encodeNormalWav(bytes) {
 validateApeWav(bytes)
 ape.FS.writeFile('/in.wav',bytes)
 try {
  assert.equal(ape.ccall('ape_encode_wav','number',['string','string','number'],['/in.wav','/out.ape',2000]),0)
  return ape.FS.readFile('/out.ape')
 } finally {for(const p of ['/in.wav','/out.ape'])try{ape.FS.unlink(p)}catch{}}
}
function generate(bits,channels,count,kind,extensible,rate=44100) {
 const bps=bits/8,pcm=Buffer.alloc(count*channels*bps);let state=123456789
 for(let i=0;i<count;i++)for(let c=0;c<channels;c++) {
  state=(Math.imul(state,1664525)+1013904223)>>>0
  const max=2**(bits-1)-1
  const value=kind==='silence'?0:kind==='extremes'?(i%2?-max-1:max):kind==='same'?Math.round(max*Math.sin(i*.04)):Math.round(max*2*state/4294967295-max)
  pcm.writeIntLE(value,(i*channels+c)*bps,bps)
 }
 const fmtSize=extensible?40:16,offset=12+8+fmtSize+8
 const wav=Buffer.alloc(offset+pcm.length+(pcm.length&1));wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(fmtSize,16)
 wav.writeUInt16LE(extensible?0xfffe:1,20);wav.writeUInt16LE(channels,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*channels*bps,28);wav.writeUInt16LE(channels*bps,32);wav.writeUInt16LE(bits,34)
 if(extensible){wav.writeUInt16LE(22,36);wav.writeUInt16LE(bits,38);wav.writeUInt32LE(channels===1?4:3,40);Buffer.from([1,0,0,0,0,0,16,0,128,0,0,170,0,56,155,113]).copy(wav,44)}
 wav.write('data',offset-8);wav.writeUInt32LE(pcm.length,offset-4);pcm.copy(wav,offset)
 return {wav,pcm}
}
let passed=0
for(const rate of [44100,48000,96000])for(const bits of [16,24])for(const channels of [1,2])for(const count of [1,73728,73729,200003])for(const kind of ['silence','extremes','same','noise']){
 const {wav,pcm}=generate(bits,channels,count,kind,bits===24,rate)
 const encoded=encodeNormalWav(wav);assert.equal(Buffer.from(encoded.subarray(0,4)).toString(),'MAC ')
 ff.FS.writeFile('input.ape',encoded);logs.length=0
 ff.exec('-v','error','-i','input.ape','-f','wav','-c:a',`pcm_s${bits}le`,'out.wav');assert.equal(ff.ret,0,logs.join('\n'));ff.reset()
 const decoded=Buffer.from(ff.FS.readFile('out.wav'));const decodedInfo=validateApeWav(decoded);assert.equal(decodedInfo.sampleRate,rate);assert.equal(decodedInfo.bits,bits);assert.equal(decodedInfo.channels,channels);let extracted
 for(let p=12;p+8<=decoded.length;){const size=decoded.readUInt32LE(p+4);if(decoded.toString('ascii',p,p+4)==='data'){extracted=decoded.subarray(p+8,p+8+size);break}p+=8+size+(size&1)}
 assert.deepEqual(extracted,pcm,`${bits}/${channels}/${count}/${kind}`)
 ff.FS.unlink('input.ape');ff.FS.unlink('out.wav');passed++
}
assert.equal(ape.ccall('ape_encode_wav','number',['string','string','number'],['/missing.wav','/out.ape',5000]),-1,'Unverified compression must be rejected')
assert.throws(()=>validateApeWav(new Uint8Array(44)),/RIFF/)
const invalid=generate(16,1,1,'silence',false).wav;invalid.writeUInt16LE(3,20);assert.throws(()=>validateApeWav(invalid),/floating/)
const ext=generate(24,2,1,'silence',true).wav;ext[44]=3;assert.throws(()=>validateApeWav(ext),/integer PCM/)
console.log(`PASS ${passed}/192 production APE WASM → independent FFmpeg WASM byte-exact tests, including 44.1/48/96kHz preserved rates and 24-bit WAVEFORMATEXTENSIBLE; invalid PCM/format/level gates.`)
