import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decryptFile } from '../src/decrypt/index.js';
import { createAudioEngine } from '../src/audio/index.js';
import { outputName, conversionPlan } from '../src/audio/presets.js';
const fixture=new URL('./fixtures/synthetic/',import.meta.url);
const read=n=>new Uint8Array(readFileSync(new URL(n,fixture)));
const manifest=JSON.parse(readFileSync(new URL('manifest.json',fixture)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const sqlWasmUrl=fileURLToPath(new URL('../node_modules/sql.js/dist/sql-wasm.wasm',import.meta.url));
test('independent integration: fixture integrity, exact plaintext and source/database immutability',async()=>{
 const dbBytes=read('kgg_fixture.db');const dbHash=sha(dbBytes);
 for(const [name,expected] of Object.entries(manifest.files)) {
  const bytes=read(name); assert.equal(sha(bytes),expected,name);
  if(name.endsWith('.db')) continue;
  if(name.includes('stag')) await assert.rejects(decryptFile(bytes,{name,dbBytes,sqlWasmUrl}),{code:'NEED_QQ_EKEY'});
  else {const out=await decryptFile(bytes,{name,dbBytes,sqlWasmUrl});assert.equal(sha(out.audio),manifest.plain_sha256,name);assert.notEqual(out.audio.buffer,bytes.buffer,name+' output must not alias input');}
  assert.equal(sha(bytes),expected,name+' source unchanged');assert.equal(sha(dbBytes),dbHash,'DB unchanged');
 }
});
test('independent integration: attacker-controlled binary lengths reject safely',async()=>{
 for(const name of ['sample.ncm','sample.kgm','sample.vpr']) for(const n of [0x7fffffff,0xffffffff]){
  const b=read(name); new DataView(b.buffer).setUint32(name.endsWith('.ncm')?10:16,n,true);
  await assert.rejects(decryptFile(b,{name}),{code:'INVALID_FILE'});
 }
});
test('output names cannot contain path separators or HTML delimiters',()=>{
 for(const name of ['../../secret.mp3','C:\\secret\\song.wav','<img src=x onerror=alert(1)>.ncm','a\0b.qmc0']) {
  const output=outputName(name,'wav');assert.ok(!/[\\/<>\x00-\x1f]/.test(output));assert.ok(output.endsWith('.wav'));
 }
});
test('all conversion presets select real codecs and strip untrusted metadata',()=>{
 for(const id of ['wav','flac','aac','mp3']){
  const {args}=conversionPlan(id,{},sourceInfo);assert.equal(args[args.indexOf('-map_metadata')+1],'-1');assert.equal(args[args.indexOf('-ac')+1],'2');assert.ok(args.includes('-c:a'));assert.ok(!args.includes('copy'));
 }
});
const sourceInfo={sampleRate:44100,channels:2,bitsPerSample:16,sampleFormat:'s16',isFloat:false,codec:'pcm_s16le'};
const probeJSON=JSON.stringify({streams:[{codec_type:'audio',codec_name:'pcm_s16le',sample_rate:'44100',channels:2,sample_fmt:'s16',bits_per_sample:16}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function mockEngine(overrides={}){return {load:async()=>{},on(){},off(){},writeFile:async()=>{},exec:async()=>0,ffprobe:async()=>0,readFile:async name=>name.endsWith('.json')?probeJSON:new Uint8Array([1,2,3]),deleteFile:async()=>{},terminate(){},...overrides};}
test('duplicate conversion rejected and successful conversion leaves source unchanged',async()=>{
 const wait=deferred();const engine=createAudioEngine({createFFmpeg:async()=>mockEngine({exec:()=>wait.promise}),assetURL:x=>x});const bytes=new Uint8Array([7,8]);
 const first=engine.convert(bytes,{preset:'wav'});await assert.rejects(engine.convert(bytes,{preset:'wav'}),/already running/);wait.resolve(0);await first;assert.deepEqual(bytes,new Uint8Array([7,8]));
});
test('abort during output read rejects stale success and allows next conversion',async()=>{
 const entered=deferred(),read=deferred();let count=0;
 const engine=createAudioEngine({createFFmpeg:async()=>++count===1?mockEngine({readFile:name=>{if(name.endsWith('.json'))return probeJSON;entered.resolve();return read.promise;}}):mockEngine(),assetURL:x=>x});
 const controller=new AbortController();const task=engine.convert(new Uint8Array([1]),{preset:'wav',signal:controller.signal});await entered.promise;controller.abort();read.resolve(new Uint8Array([1]));await assert.rejects(task,{name:'AbortError'});
 assert.equal((await engine.convert(new Uint8Array([1]),{preset:'wav'})).extension,'wav');assert.equal(count,2);
});
test('already canceled conversion never loads a runtime',async()=>{
 const controller=new AbortController();controller.abort();let called=false;const engine=createAudioEngine({createFFmpeg:async()=>{called=true;return mockEngine();},assetURL:x=>x});await assert.rejects(engine.convert(new Uint8Array([1]),{preset:'wav',signal:controller.signal}),{name:'AbortError'});assert.equal(called,false);
});

// Queue helpers are exercised independently from the UI's own tests.
import {safeOutputName,validateAddition,LIMITS} from '../src/queue/files.js';
import {zipSync,unzipSync} from 'fflate';
test('ZIP outputs prevent traversal, prototype names, reserved names, collisions and metadata injection',()=>{
 const used=new Set(),entries=Object.create(null);
 for(const input of ['../../secret.ncm','..\\..\\secret.ncm','CON.ncm','__proto__.ncm','<script>alert(1)</script>.ncm','same.ncm','SAME.ncm']){
  const name=safeOutputName(input,'wav',used);assert.ok(!/[\\/<>\x00-\x1f]/.test(name));assert.ok(!name.startsWith('.'));assert.ok(!/^CON\./i.test(name));entries[name]=new Uint8Array([1]);
 }
 const extracted=unzipSync(zipSync(entries));assert.equal(Object.keys(extracted).length,7);assert.equal(used.size,7);
});
test('queue limits reject empty and oversized input, cap count and batch',()=>{
 assert.equal(validateAddition([],[{name:'zero',size:0},{name:'big',size:LIMITS.file+1}]).accepted.length,0);
 assert.equal(validateAddition([],Array.from({length:21},(_,i)=>({name:String(i),size:1}))).accepted.length,20);
 assert.equal(validateAddition([],Array.from({length:5},(_,i)=>({name:String(i),size:LIMITS.file}))).accepted.length,4);
});

test('source mode preserves probed channels/rate rather than hidden stereo resampling',()=>{
 const source={...sourceInfo,sampleRate:96000,channels:6,bitsPerSample:24};
 for(const id of ['wav','flac']) {const plan=conversionPlan(id,{},source);assert.equal(plan.expected.sampleRate,96000);assert.equal(plan.expected.channels,6);assert.equal(plan.expected.bitsPerSample,24);}
 assert.throws(()=>conversionPlan('mp3',{},source),/MP3/);
 assert.throws(()=>conversionPlan('flac',{}, {...source,isFloat:true}),/FLAC/);
 assert.throws(()=>conversionPlan('ape',{},source),/APE/);
});
test('mismatched actual output fails closed instead of extension-only success',async()=>{
 const wrong=JSON.stringify({streams:[{codec_type:'audio',codec_name:'pcm_s16le',sample_rate:'48000',channels:2,sample_fmt:'s16',bits_per_sample:16}]});
 const engine=createAudioEngine({createFFmpeg:async()=>mockEngine({readFile:async name=>name==='output-probe.json'?wrong:probeJSON}),assetURL:x=>x});
 await assert.rejects(engine.convert(new Uint8Array([1]),{preset:'wav'}),/实际输出参数/);
});
test('cancel during source probe prevents any encoder execution',async()=>{
 const entered=deferred(),wait=deferred();let executions=0;
 const engine=createAudioEngine({createFFmpeg:async()=>mockEngine({ffprobe:()=>{entered.resolve();return wait.promise;},exec:async()=>{executions++;return 0;}}),assetURL:x=>x});
 const controller=new AbortController(),job=engine.convert(new Uint8Array([1]),{preset:'wav',signal:controller.signal});await entered.promise;controller.abort();wait.resolve(0);await assert.rejects(job,{name:'AbortError'});assert.equal(executions,0);
});

test('APE cancellation aborts encoder signal, terminates FFmpeg, rejects stale result and permits retry',async()=>{
 const entered=deferred();let encoderAborted=false,terminated=0,factories=0;
 const fixtureWav=read('plain.wav');
 const engine=createAudioEngine({assetURL:x=>x,createFFmpeg:async()=>{factories++;return mockEngine({terminate(){terminated++;},readFile:async name=>name.endsWith('.json')?probeJSON:fixtureWav});},encodeApeImpl:async(bytes,{signal})=>new Promise((resolve,reject)=>{assert.equal(signal.aborted,false);signal.addEventListener('abort',()=>{encoderAborted=true;reject(new DOMException('canceled','AbortError'));},{once:true});entered.resolve();})});
 const controller=new AbortController();const task=engine.convert(fixtureWav,{preset:'ape',quality:'16',signal:controller.signal});await entered.promise;controller.abort();await assert.rejects(task,{name:'AbortError'});assert.equal(encoderAborted,true);assert.equal(terminated,1);
 assert.equal((await engine.convert(fixtureWav,{preset:'wav',quality:'16'})).extension,'wav');assert.equal(factories,2);
});

test('APE worker adapter terminates on abort without detaching source',async()=>{
 const {encodeApe}=await import('../src/audio/ape-encoder.js');const previous=globalThis.Worker;let posted,terminated=0;
 class FakeWorker {postMessage(message){posted=message;}terminate(){terminated++;}}
 globalThis.Worker=FakeWorker;
 try {const source=read('plain.wav'),original=sha(source),controller=new AbortController();const pending=encodeApe(source,{signal:controller.signal,coreURL:'https://example.invalid/self/ape.js',wasmURL:'https://example.invalid/self/ape.wasm'});assert.ok(posted.bytes instanceof ArrayBuffer);assert.notEqual(posted.bytes,source.buffer);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(terminated,1);assert.equal(sha(source),original);}finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
