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
 for(const id of ['wav-44100','wav-48000','aac-2010','mp3-compact']){
  const {args}=conversionPlan(id);assert.equal(args[args.indexOf('-map_metadata')+1],'-1');assert.equal(args[args.indexOf('-ac')+1],'2');assert.ok(args.includes('-c:a'));assert.ok(!args.includes('copy'));
 }
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function mockEngine(overrides={}){return {load:async()=>{},on(){},off(){},writeFile:async()=>{},exec:async()=>0,readFile:async()=>new Uint8Array([1,2,3]),deleteFile:async()=>{},terminate(){},...overrides};}
test('duplicate conversion rejected and successful conversion leaves source unchanged',async()=>{
 const wait=deferred();const engine=createAudioEngine({createFFmpeg:async()=>mockEngine({exec:()=>wait.promise}),assetURL:x=>x});const bytes=new Uint8Array([7,8]);
 const first=engine.convert(bytes,{preset:'wav-44100'});await assert.rejects(engine.convert(bytes,{preset:'wav-44100'}),/already running/);wait.resolve(0);await first;assert.deepEqual(bytes,new Uint8Array([7,8]));
});
test('abort during output read rejects stale success and allows next conversion',async()=>{
 const entered=deferred(),read=deferred();let count=0;
 const engine=createAudioEngine({createFFmpeg:async()=>++count===1?mockEngine({readFile:()=>{entered.resolve();return read.promise;}}):mockEngine(),assetURL:x=>x});
 const controller=new AbortController();const task=engine.convert(new Uint8Array([1]),{preset:'wav-44100',signal:controller.signal});await entered.promise;controller.abort();read.resolve(new Uint8Array([1]));await assert.rejects(task,{name:'AbortError'});
 assert.equal((await engine.convert(new Uint8Array([1]),{preset:'wav-44100'})).extension,'wav');assert.equal(count,2);
});
test('already canceled conversion never loads a runtime',async()=>{
 const controller=new AbortController();controller.abort();let called=false;const engine=createAudioEngine({createFFmpeg:async()=>{called=true;return mockEngine();},assetURL:x=>x});await assert.rejects(engine.convert(new Uint8Array([1]),{preset:'wav-44100',signal:controller.signal}),{name:'AbortError'});assert.equal(called,false);
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
