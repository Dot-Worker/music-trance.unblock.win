// QA-only streaming ZIP boundary test, actual production worker in Node bridge.
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {Unzip,UnzipInflate} from 'fflate';
import assert from 'node:assert/strict';
import {createZipArchive,ZIP_CHUNK_BYTES,validateZipOutputs} from '../src/queue/zip.js';
import {LIMITS,assertResultBudget,remainingResultBytes} from '../src/queue/files.js';
const sizeMiB=Number(process.argv[2]||256);if(!(sizeMiB>0&&sizeMiB<=256))throw Error('Bounded to 256 MiB');
if(process.availableMemory()<2*1024**3)throw Error('Insufficient available memory');
const workers=new Set(),report={started:new Date().toISOString(),sourceMiB:sizeMiB,baselineRSS:process.memoryUsage().rss,availableStart:process.availableMemory(),method:'Actual production ZIP helper and worker under Node bridge; absolute process RSS, not browser measurement.'};let peakRSS=report.baselineRSS;
const watch=setInterval(()=>{const rss=process.memoryUsage().rss;peakRSS=Math.max(peakRSS,rss);if(rss>2*1024**3||process.availableMemory()<1024**3){report.safetyStop={rss,available:process.availableMemory()};for(const w of workers)w.terminate()}},100);watch.unref();
function workerFactory(){
 const inner=new Worker(new URL('./qa/browser-worker-bootstrap.mjs',import.meta.url),{workerData:{module:new URL('../src/queue/zip-worker.js',import.meta.url).href}});workers.add(inner);
 const bridge={postMessage:(m,t)=>inner.postMessage(m,t),terminate:()=>inner.terminate()};inner.on('message',data=>bridge.onmessage?.({data}));inner.on('error',e=>bridge.onerror?.(e));inner.on('exit',()=>workers.delete(inner));return bridge;
}
async function verify(archive,expected){
 const actual={};const done=[];
 const unzip=new Unzip(file=>{const h=createHash('sha256');let size=0;const p=new Promise((resolve,reject)=>{file.ondata=(error,chunk,final)=>{if(error){reject(error);return}h.update(chunk);size+=chunk.length;if(final){actual[file.name]={size,sha256:h.digest('hex')};resolve()}}});done.push(p);file.start()});unzip.register(UnzipInflate);
 for await(const chunk of archive.stream())unzip.push(chunk,false);unzip.push(new Uint8Array(),true);await Promise.all(done);assert.deepEqual(actual,expected);return actual;
}
try{
 const chunk=Uint8Array.from({length:ZIP_CHUNK_BYTES},(_,i)=>(i*29+13)%251);const outputs=[],expected={};
 for(let index=0;index<2;index++){
  const count=sizeMiB/2;if(!Number.isInteger(count))throw Error('Even integer MiB only');const parts=Array(count).fill(chunk);const blob=new Blob(parts);const name=`synthetic-${index}.bin`;const h=createHash('sha256');for(const p of parts)h.update(p);expected[name]={size:blob.size,sha256:h.digest('hex')};
  outputs.push({outputName:name,blob:{size:blob.size,slice:(...args)=>blob.slice(...args),arrayBuffer(){throw Error('Forbidden whole source Blob read')}}});
 }
 const start=Date.now();const archive=await createZipArchive(outputs,{workerFactory});report.zipMs=Date.now()-start;report.archiveBytes=archive.size;report.verified=await verify(archive,expected);report.exactBoundary=sizeMiB*1048576===LIMITS.zip;
 const controller=new AbortController();await assert.rejects(createZipArchive(outputs,{workerFactory,signal:controller.signal,onProgress:()=>controller.abort()}),e=>e.name==='AbortError');report.cancelled=true;
 const retry=await createZipArchive([{outputName:'retry.txt',blob:new Blob(['retry passed'])}],{workerFactory});report.retry=await verify(retry,{'retry.txt':{size:12,sha256:createHash('sha256').update('retry passed').digest('hex')}});
 let created=false;await assert.rejects(createZipArchive([{outputName:'too-big',blob:{size:LIMITS.zip+1,slice(){throw Error('Unexpected read')}}}],{workerFactory:()=>{created=true;throw Error('Unexpected worker')}}));assert.equal(created,false);report.overBoundaryRejectedBeforeAllocation=true;
 const retained=[{blob:{size:LIMITS.results-1}}];assert.equal(remainingResultBytes(retained),1);assertResultBudget(retained,1);assert.throws(()=>assertResultBudget(retained,2));retained[0].blob=null;assert.equal(remainingResultBytes(retained),LIMITS.results);report.accumulationBudgetAndRelease=true;
 report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}
finally{for(const w of workers)await w.terminate();clearInterval(watch);report.peakRSS=Math.max(peakRSS,process.resourceUsage().maxRSS*1024);report.peakRSSMiB=report.peakRSS/1048576;report.finished=new Date().toISOString();await mkdir('../qa/large-audio',{recursive:true});await writeFile('../qa/large-audio/zip-'+sizeMiB+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
