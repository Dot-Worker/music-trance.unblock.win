import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Zip,ZipPassThrough,unzipSync} from 'fflate';
import {LIMITS,validateAddition,retainedBytes,remainingResultBytes,assertResultBudget} from '../src/queue/files.js';
import {createZipArchive,validateZipOutputs,ZIP_CHUNK_BYTES} from '../src/queue/zip.js';
const source=readFileSync(new URL('../src/queue/zip-worker.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
function fakeWorker(stats,onSend=()=>{}){
 const self={postMessage:(message,transfer)=>{const data=structuredClone(message,{transfer});queueMicrotask(()=>{if(!worker.stopped)worker.onmessage?.({data});});}};
 const worker={stopped:false,postMessage(message,transfer){stats.push({type:message.type,length:message.bytes?.byteLength});onSend(message,worker);if(this.stopped)return;const data=structuredClone(message,{transfer});queueMicrotask(()=>{if(!this.stopped)self.onmessage({data});});},terminate(){this.stopped=true;}};
 vm.runInNewContext(source,{self,Zip,ZipPassThrough,Uint8Array});return worker;
}
test('desktop limits bound file, input batch, result accumulation and ZIP independently without allocating',()=>{
 assert.equal(LIMITS.file,256*1024*1024);assert.equal(LIMITS.batch,512*1024*1024);assert.equal(LIMITS.results,512*1024*1024);assert.equal(LIMITS.zip,256*1024*1024);assert.equal(LIMITS.count,20);
 const file=size=>({name:'x',size});assert.equal(validateAddition([],[file(LIMITS.file+1)]).accepted.length,0);assert.equal(validateAddition([file(LIMITS.file)],[file(LIMITS.file),file(1)]).accepted.length,1);
 const rows=[{blob:{size:LIMITS.results-10}},{blob:null}];assert.equal(retainedBytes(rows),LIMITS.results-10);assert.equal(remainingResultBytes(rows),10);assert.equal(assertResultBudget(rows,10),10);assert.throws(()=>assertResultBudget(rows,11));rows[0].blob=null;assert.equal(remainingResultBytes(rows),LIMITS.results);assert.throws(()=>assertResultBudget(rows,0));
 assert.throws(()=>validateZipOutputs([{blob:{size:LIMITS.zip+1}}]));assert.equal(validateZipOutputs([{blob:{size:LIMITS.zip}}]),LIMITS.zip);
});
test('ZIP streams bounded slices with backpressure and creates valid archive without whole-Blob reads',async()=>{
 const bytes=new Uint8Array(ZIP_CHUNK_BYTES*2+19).fill(7),blob=new Blob([bytes]),stats=[];let slices=0;
 const output={outputName:'音频.wav',blob:{size:blob.size,slice(...args){slices++;return blob.slice(...args);},arrayBuffer(){throw new Error('Must not read whole blob');}}};
 const archive=await createZipArchive([output],{workerFactory:()=>fakeWorker(stats)});const unzipped=unzipSync(new Uint8Array(await archive.arrayBuffer()));assert.deepEqual(unzipped[output.outputName],bytes);assert.equal(slices,3);assert.ok(stats.filter(m=>m.type==='chunk').every(m=>m.length<=ZIP_CHUNK_BYTES));
});
test('repeated ZIP cancellation terminates worker, rejects stale completion and permits a fresh retry',async()=>{
 for(let i=0;i<3;i++){const controller=new AbortController(),stats=[];let worker;await assert.rejects(createZipArchive([{outputName:'x.wav',blob:new Blob([new Uint8Array(1024)])}],{signal:controller.signal,workerFactory:()=>worker=fakeWorker(stats,message=>{if(message.type==='chunk')controller.abort();})}),error=>error.name==='AbortError');assert.equal(worker.stopped,true);}
 const archive=await createZipArchive([{outputName:'x.wav',blob:new Blob(['ok'])}],{workerFactory:()=>fakeWorker([])});assert.equal(new TextDecoder().decode(unzipSync(new Uint8Array(await archive.arrayBuffer()))['x.wav']),'ok');
});
test('oversized ZIP rejects before allocating a worker or reading files',async()=>{let created=false;await assert.rejects(createZipArchive([{outputName:'x.wav',blob:{size:LIMITS.zip+1,slice(){throw Error('read');}}}],{workerFactory(){created=true;throw Error('worker');}}),/打包限制/);assert.equal(created,false);});
