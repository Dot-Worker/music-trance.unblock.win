// QA-only, opt-in bounded large-audio test. Run each case as a fresh process.
// Example: node --expose-gc scripts/test-large-audio.mjs --pcm-mib 160 --preset ape
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {makeFixture,verifyAudio,activeChildren} from './qa/large-fixture.mjs';
import {createAudioEngine} from '../src/audio/index.js';
import {encodeApe} from '../src/audio/ape-encoder.js';
const argv=process.argv.slice(2);const opt=(k,d)=>{const i=argv.indexOf('--'+k);return i<0?d:argv[i+1]};
const pcmMiB=Number(opt('pcm-mib','160')),preset=opt('preset','ape'),kind=opt('kind','noise8'),inputKind=opt('input','flac'),profile=opt('profile','desktop');
const expectError=opt('expect-error',''),maxOutputBytes=Number(opt('max-output-mib','512'))*1048576;
const reportPath=resolve(opt('report',`../qa/large-audio/${preset}-${pcmMiB}-${kind}.json`));
const maxRSS=Number(opt('max-rss-mib','3072'))*1048576,minAvailable=Number(opt('min-available-mib','1024'))*1048576;
if(!(pcmMiB>0&&pcmMiB<=520))throw Error('QA bounded to 0 < PCM MiB <= 520');
if(!['ape','flac','wav'].includes(preset))throw Error('QA presets restricted');
const available=()=>process.availableMemory?.()??0;
if(available()&&available()<3*1024**3&&pcmMiB>64)throw Error('Insufficient available RAM to start a large test safely');
const report={started:new Date().toISOString(),node:process.version,preset,pcmMiB,kind,inputKind,profile,baselineRSS:process.memoryUsage().rss,availableStart:available(),method:'Node production WASM Worker threads; RSS includes all threads; independent native FFmpeg PCM hash/duration verification. Not browser RSS.',samples:[],stages:[]};
const workers=new Set();let peakRSS=report.baselineRSS,lowAvailable=report.availableStart,stage='fixture',finished=false;
function sample(){const rss=process.memoryUsage().rss,av=available();peakRSS=Math.max(peakRSS,rss);if(av)lowAvailable=Math.min(lowAvailable,av);if(report.samples.length<1200)report.samples.push({ms:Date.now()-start,rss,available:av,stage});if(rss>maxRSS||(av&&av<minAvailable)){report.safetyStop={rss,available:av,stage};for(const w of workers)w.terminate();for(const p of activeChildren)p.kill('SIGTERM');}}
const start=Date.now();const interval=setInterval(sample,250);interval.unref();
function setStage(value){if(report.safetyStop)throw Error('QA memory safety stop');stage=value;report.stages.push({stage,ms:Date.now()-start,rss:process.memoryUsage().rss});console.log(JSON.stringify({stage,elapsedMs:Date.now()-start,rssMiB:Math.round(process.memoryUsage().rss/1048576)}));}
function rpcCore(kind){
 const worker=new Worker(new URL('./qa/large-core-worker.mjs',import.meta.url),{workerData:{kind}});workers.add(worker);
 let seq=0,ended=false;const pending=new Map(),handlers=new Map();let readyResolve,readyReject;
 const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j});
 const rejectAll=e=>{readyReject(e);for(const p of pending.values())p.reject(e);pending.clear()};
 worker.on('message',data=>{if(data.event==='ready')readyResolve();else if(data.event)for(const fn of handlers.get(data.event)||[])fn(data.data);else{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(new Error(data.error+'\n'+data.logs?.join('\n'))):p.resolve(data.result)}});
 worker.on('error',rejectAll);worker.on('exit',code=>{workers.delete(worker);if(!ended)rejectAll(new Error(kind+' worker exited '+code));});
 const call=async(op,args=[],trans=[])=>{await ready;if(ended)throw Error('worker terminated');return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,op,args},trans);})};
 return {ready,call,load:async()=>ready,on:(event,fn)=>{if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event).add(fn)},off:(event,fn)=>handlers.get(event)?.delete(fn),writeFile:(p,b)=>call('writeFile',[p,b],b instanceof Uint8Array?[b.buffer]:[]),readFile:(p,e)=>call('readFile',[p,e]),deleteFile:p=>call('deleteFile',[p]),exec:args=>call('exec',[args]),ffprobe:args=>call('ffprobe',[args]),terminate(){ended=true;rejectAll(new DOMException('Terminated','AbortError'));worker.terminate();}};
}
let currentCore,engine;
const root=resolve('../qa/large-audio');await mkdir(root,{recursive:true});const dir=await mkdtemp(root+'/fixture-');
try{
 setStage('generate-synthetic-fixture');const fixture=await makeFixture(dir,pcmMiB,{kind});report.fixture={...fixture,wavPath:undefined,flacPath:undefined};
 setStage('load-input');let input=await readFile(inputKind==='wav'?fixture.wavPath:fixture.flacPath);report.inputBytes=input.length;
 const createFFmpeg=async()=>{currentCore=rpcCore('ffmpeg');await currentCore.ready;return currentCore};
 globalThis.Worker=class BrowserWorkerBridge {
  constructor(module){this.inner=new Worker(new URL('./qa/browser-worker-bootstrap.mjs',import.meta.url),{workerData:{module:String(module)}});workers.add(this.inner);this.inner.on('message',data=>this.onmessage?.({data}));this.inner.on('error',error=>this.onerror?.({message:error.message}));this.inner.on('exit',()=>workers.delete(this.inner));}
  postMessage(message,transfer){this.inner.postMessage(message,transfer)}
  terminate(){return this.inner.terminate()}
 };
 const encodeApeImpl=async(wav,options={})=>encodeApe(wav,{...options,coreURL:new URL('../artifacts/ape/ape.js',import.meta.url).href,wasmURL:new URL('../artifacts/ape/ape.wasm',import.meta.url).href});

 engine=createAudioEngine({createFFmpeg,assetURL:p=>p,encodeApeImpl});
 setStage('engine-convert');const conversionStart=Date.now();
 const result=await engine.convert(new Uint8Array(input.buffer,input.byteOffset,input.byteLength),{preset,maxOutputBytes,quality:'source',sampleRate:'source',name:'synthetic.'+inputKind,onStatus:setStage});
 input=null;report.conversionMs=Date.now()-conversionStart;report.outputBytes=result.bytes.byteLength;report.audioInfo=result.audioInfo;report.sourceInfo=result.sourceInfo;
 const files=await currentCore.call('list');assert.ok(!files.some(p=>/^(input\.bin|source-probe\.json|output-probe\.json|output\.|ape-)/.test(p)),'MEMFS cleaned after conversion: '+files);
 report.ffmpegCore=await currentCore.call('stats');
 setStage('save-output');const output=dir+'/output.'+result.extension;await writeFile(output,result.bytes);report.encodedSHA256=createHash('sha256').update(result.bytes).digest('hex');
 engine.dispose();engine=null;
 setStage('independent-verification');report.verification=await verifyAudio(output,fixture);
 report.apeAdapter=preset==='ape'?'Actual src/audio/ape-encoder.js and ape-worker.js through Node browser-Worker shim':undefined;if(expectError)throw Error('Expected rejection did not occur: '+expectError);report.passed=true;
}catch(error){report.expectedError=expectError||undefined;report.passed=Boolean(expectError&&new RegExp(expectError).test(error.message));report.rejectedWithoutExport=report.passed;report.error={message:error.message,stack:error.stack};console.error(error);if(!report.passed)process.exitCode=1;}
finally{
 engine?.dispose();for(const w of workers)await w.terminate();sample();clearInterval(interval);report.elapsedMs=Date.now()-start;report.peakRSS=Math.max(peakRSS,process.resourceUsage().maxRSS*1024);report.peakRSSMiB=report.peakRSS/1048576;report.lowAvailable=lowAvailable;report.finished=new Date().toISOString();
 await writeFile(reportPath,JSON.stringify(report,null,2));await rm(dir,{recursive:true,force:true});console.log(JSON.stringify({passed:report.passed,inputMiB:report.inputBytes/1048576,pcmMiB,outputMiB:report.outputBytes/1048576,peakRSSMiB:report.peakRSSMiB,elapsedMs:report.elapsedMs,report:reportPath}));
}
