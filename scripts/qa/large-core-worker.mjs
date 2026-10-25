// QA-only Node Worker adapter: runs the unchanged production WASM binaries.
import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
const kind=workerData.kind;
const root=new URL('../../',import.meta.url);
const binary=kind==='ape'?'artifacts/ape/ape.wasm':'artifacts/core/test-core.wasm';
const factory=require(new URL(kind==='ape'?'artifacts/ape/ape.cjs':'artifacts/core/ffmpeg-core.cjs',root).pathname);
const core=await factory({wasmBinary:await readFile(new URL(binary,root))});
let logs=[];
core.setLogger?.(({message})=>{logs.push(message);if(logs.length>30)logs.shift();});
core.setProgress?.(data=>parentPort.postMessage({event:'progress',data}));
parentPort.on('message',async({id,op,args})=>{
 try {
  let result;
  if(op==='writeFile') {core.FS.writeFile(args[0],args[1],{canOwn:args[1] instanceof Uint8Array});result=true;}
  else if(op==='readFile')result=core.FS.readFile(args[0],args[1]?{encoding:args[1]}:undefined);
  else if(op==='deleteFile'){core.FS.unlink(args[0]);result=true;}
  else if(op==='list') result=core.FS.readdir('/');
  else if(op==='stats')result={heapBytes:core.HEAPU8?.byteLength||core.HEAP8?.byteLength,rss:process.memoryUsage().rss};
  else if(op==='exec'||op==='ffprobe'){logs=[];core[op](...args[0]);result=core.ret;core.reset();}
  else if(op==='ape'){
   core.FS.writeFile('/input.wav',args[0],{canOwn:true});
   // Release the transferred view after FS import, matching intended ownership path.
   args[0]=null;
   const code=core.ccall('ape_encode_wav','number',['string','string','number'],['/input.wav','/output.ape',2000]);
   if(code)throw new Error('APE encoder status '+code);
   core.FS.unlink('/input.wav');
   result=core.FS.readFile('/output.ape');
   core.FS.unlink('/output.ape');
  } else throw new Error('Unknown QA operation: '+op);
  parentPort.postMessage({id,result,logs},result instanceof Uint8Array?[result.buffer]:[]);
 } catch(error){parentPort.postMessage({id,error:error.message,logs});}
});
parentPort.postMessage({event:'ready'});
