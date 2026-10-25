// Test the actual API with both real WASM engines, including per-file lossless verification.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createAudioEngine} from '../src/audio/index.js';
import {validateApeWav} from '../src/audio/ape-wav.js';
const require=createRequire(import.meta.url);globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
const ffBytes=await readFile(new URL('../artifacts/core/test-core.wasm',import.meta.url));
const ape=await require('../artifacts/ape/ape.cjs')({wasmBinary:await readFile(new URL('../artifacts/ape/ape.wasm',import.meta.url))});
let active,loads=0,terminated=0,corrupt=false;
async function createFFmpeg(){active=await require('../artifacts/core/ffmpeg-core.cjs')({wasmBinary:ffBytes});const m=active;return{load:async()=>{loads++;},on(){},off(){},writeFile:async(p,b)=>m.FS.writeFile(p,b),readFile:async(p,encoding)=>m.FS.readFile(p,encoding?{encoding}:undefined),deleteFile:async p=>m.FS.unlink(p),terminate(){terminated++;for(const p of ['input.bin','source-probe.json','output-probe.json','ape-prepared.wav','output.ape','ape-check.wav'])try{m.FS.unlink(p)}catch{}},exec:async args=>{m.exec(...args);const result=m.ret;m.reset();return result;},ffprobe:async args=>{m.ffprobe(...args);const result=m.ret;m.reset();return result;}};}
async function encodeApeImpl(wav){const description=validateApeWav(wav);const input=wav.slice();if(corrupt)input[description.dataOffset]^=1;ape.FS.writeFile('/input.wav',input);try{const status=ape.ccall('ape_encode_wav','number',['string','string','number'],['/input.wav','/output.ape',2000]);assert.equal(status,0);return ape.FS.readFile('/output.ape');}finally{for(const p of ['/input.wav','/output.ape'])try{ape.FS.unlink(p)}catch{}}}
function fixture(rate,channels,bits){const count=257,bps=bits/8,pcm=Buffer.alloc(count*channels*bps),max=2**(bits-1)-1;for(let i=0;i<count*channels;i++)pcm.writeIntLE(Math.round(Math.sin(i*.37)*max),i*bps,bps);const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(channels,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*channels*bps,28);wav.writeUInt16LE(channels*bps,32);wav.writeUInt16LE(bits,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);return wav;}
const engine=createAudioEngine({createFFmpeg,assetURL:p=>p,encodeApeImpl});
let cases=0;
for(const rate of [44100,48000,96000])for(const channels of [1,2])for(const bits of [16,24]){
 const result=await engine.convert(fixture(rate,channels,bits),{preset:'ape',name:'synthetic.wav'});
 assert.equal(result.audioInfo.codec,'ape');assert.equal(result.audioInfo.sampleRate,rate);assert.equal(result.audioInfo.channels,channels);assert.equal(result.audioInfo.bitsPerSample,bits);assert.equal(result.name,'synthetic.ape');
 for(const p of ['input.bin','source-probe.json','output-probe.json','ape-prepared.wav','output.ape','ape-check.wav'])assert.equal(active.FS.analyzePath(p).exists,false,'MEMFS cleanup '+p);
 cases++;
}
assert.equal(loads,1,'Sequential APE files reuse only the FFmpeg core');
for(const rate of ['44100','48000']){const result=await engine.convert(fixture(96000,2,24),{preset:'ape',sampleRate:rate,quality:'16'});assert.equal(result.audioInfo.sampleRate,Number(rate));assert.equal(result.audioInfo.bitsPerSample,16);cases++;}
corrupt=true;await assert.rejects(engine.convert(fixture(48000,1,16),{preset:'ape'}),/PCM 不一致/);assert.equal(terminated,1);corrupt=false;
const retry=await engine.convert(fixture(48000,1,16),{preset:'ape'});assert.equal(retry.audioInfo.channels,1);assert.equal(loads,2);cases++;
engine.dispose();
console.log(`PASS actual APE API: ${cases} files, source/explicit rates, bit depths, mono/stereo, byte-exact verification, deliberately wrong PCM rejected, fresh-core retry, complete cleanup.`);
