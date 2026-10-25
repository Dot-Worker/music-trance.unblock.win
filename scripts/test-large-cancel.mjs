// QA-only true Worker termination + recovery and bounded result-cap rejection.
import {Worker} from 'node:worker_threads';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createAudioEngine} from '../src/audio/index.js';
import {makeFixture,verifyAudio} from './qa/large-fixture.mjs';
const root='../qa/large-audio';await mkdir(root,{recursive:true});const dir=await mkdtemp(root+'/cancel-');
const workers=new Set(),report={started:new Date().toISOString(),baselineRSS:process.memoryUsage().rss,cancellations:[],method:'Real FFmpeg WASM in Node worker, physical worker termination and fresh-core retry; not browser UI test.'};let loads=0,execs=0,terminations=0,peakRSS=report.baselineRSS;
if(process.availableMemory()<2*1024**3)throw Error('Insufficient available memory');
const watch=setInterval(()=>{peakRSS=Math.max(peakRSS,process.memoryUsage().rss);if(peakRSS>2*1024**3||process.availableMemory()<1024**3)for(const w of workers)w.terminate()},100);watch.unref();
async function factory(){
 loads++;const w=new Worker(new URL('./qa/large-core-worker.mjs',import.meta.url),{workerData:{kind:'ffmpeg'}});workers.add(w);const handlers=new Set(),pending=new Map();let seq=0,resolveReady,rejectReady,terminated=false;const ready=new Promise((r,j)=>{resolveReady=r;rejectReady=j});
 const fail=error=>{rejectReady(error);for(const p of pending.values())p.reject(error);pending.clear()};
 w.on('message',m=>{if(m.event==='ready')resolveReady();else if(m.event==='progress')for(const fn of handlers)fn(m.data);else{const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result)}}});w.on('error',fail);w.on('exit',code=>{workers.delete(w);if(!terminated)fail(new Error('Worker exit '+code))});
 const call=async(op,args=[],transfer=[])=>{await ready;if(terminated)throw new DOMException('Terminated','AbortError');return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});w.postMessage({id,op,args},transfer)})};
 const terminate=()=>{if(terminated)return;terminated=true;terminations++;fail(new DOMException('Terminated','AbortError'));w.terminate()};
 await ready;return {load:()=>ready,on:(_,fn)=>handlers.add(fn),off:(_,fn)=>handlers.delete(fn),writeFile:(p,b)=>call('writeFile',[p,b],[b.buffer]),readFile:(p,e)=>call('readFile',[p,e]),deleteFile:p=>call('deleteFile',[p]),exec:args=>{execs++;return call('exec',[args])},ffprobe:args=>call('ffprobe',[args]),terminate};
}
const engine=createAudioEngine({createFFmpeg:factory,assetURL:p=>p});
try{
 const large=await makeFixture(dir,64,{kind:'noise24'});const largePath=dir+'/large.wav';await (await import('node:fs/promises')).rename(large.wavPath,largePath);
 const small=await makeFixture(dir,0.5,{kind:'noise8'});
 for(let i=0;i<2;i++){
  const controller=new AbortController();let timer,firedAt=0;
  await assert.rejects(engine.convert(await readFile(largePath),{preset:'flac',signal:controller.signal,onStatus:status=>{if(status==='正在本地转码…')timer=setTimeout(()=>{firedAt=Date.now();controller.abort()},75)}}),e=>e.name==='AbortError');clearTimeout(timer);assert.ok(firedAt,'Actually cancelled an executing conversion');
  report.cancellations.push({iteration:i+1,settledMs:Date.now()-firedAt,execs,terminations});
  const result=await engine.convert(await readFile(small.flacPath),{preset:'wav'});const path=dir+`/retry-${i}.wav`;await writeFile(path,result.bytes);await verifyAudio(path,small);
 }
 const before=execs;
 await assert.rejects(engine.convert(await readFile(largePath),{preset:'wav',maxOutputBytes:1024*1024}),/预计 PCM|可用/);assert.equal(execs,before,'Known oversized PCM rejected before FFmpeg exec');report.preflightBudgetRejected=true;
 // Compressed output cannot be forecast exactly: actual byte cap must reject a truncated result.
 await assert.rejects(engine.convert(await readFile(largePath),{preset:'flac',maxOutputBytes:1024*1024}),/budget|exceed|预算|限制/);report.runtimeCompressedCapRejected=true;
 const afterError=await engine.convert(await readFile(small.flacPath),{preset:'wav'});const retryPath=dir+'/retry-after-cap.wav';await writeFile(retryPath,afterError.bytes);report.retryAfterBudgetError=await verifyAudio(retryPath,small);
 report.passed=true;report.loads=loads;report.execs=execs;report.terminations=terminations;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}
finally{engine.dispose();for(const w of workers)await w.terminate();clearInterval(watch);report.peakRSSMiB=Math.max(peakRSS,process.resourceUsage().maxRSS*1024)/1048576;report.finished=new Date().toISOString();await writeFile(root+'/cancel-and-budget.json',JSON.stringify(report,null,2));await rm(dir,{recursive:true,force:true});console.log(JSON.stringify(report));}
