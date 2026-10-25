import {LIMITS,formatBytes} from './files.js';
export const ZIP_CHUNK_BYTES=1024*1024;
const aborted=()=>new DOMException('已停止打包','AbortError');
export function validateZipOutputs(outputs){
 const total=outputs.reduce((sum,item)=>sum+item.blob.size,0);
 if(!outputs.length)throw new Error('没有可打包的输出。');
 if(outputs.length>LIMITS.count||total>LIMITS.zip)throw new Error(`输出超过 ${formatBytes(LIMITS.zip)} 打包限制，请逐首下载。`);
 return total;
}
/** Stream one 1MiB slice at a time; never copy all source Blobs into RAM together. */
export async function createZipArchive(outputs,{signal,onProgress=()=>{},workerFactory=()=>new Worker(new URL('./zip-worker.js',import.meta.url),{type:'module'})}={}){
 const total=validateZipOutputs(outputs);if(signal?.aborted)throw aborted();
 const worker=workerFactory();let pending=null,failed=null,final=false,written=0;const chunks=[];
 const fail=error=>{failed=error;pending?.reject(error);pending=null;};
 const abort=()=>{worker.terminate();chunks.length=0;fail(aborted());};
 worker.onmessage=({data})=>{if(failed)return;if(data.type==='data'){chunks.push(data.bytes);final=Boolean(data.final);}else if(data.type==='ack'){pending?.resolve();pending=null;}else fail(new Error(data.message||'ZIP 引擎失败，请逐首下载。'));};
 worker.onerror=()=>fail(new Error('ZIP 引擎无法运行，请逐首下载。'));
 signal?.addEventListener('abort',abort,{once:true});
 const send=(message,transfer=[])=>{if(signal?.aborted||failed)return Promise.reject(failed||aborted());return new Promise((resolve,reject)=>{pending={resolve,reject};try{worker.postMessage(message,transfer);}catch(error){fail(error);}});};
 try{
  await send({type:'start'});
  for(const item of outputs){
   await send({type:'file',name:item.outputName});
   for(let offset=0;offset<item.blob.size;offset+=ZIP_CHUNK_BYTES){
    if(signal?.aborted)throw aborted();
    const bytes=await item.blob.slice(offset,offset+ZIP_CHUNK_BYTES).arrayBuffer();
    if(signal?.aborted)throw aborted();
    const length=bytes.byteLength;await send({type:'chunk',bytes,last:offset+length>=item.blob.size},[bytes]);written+=length;onProgress(total?written/total:1);
   }
   if(!item.blob.size)await send({type:'chunk',bytes:new ArrayBuffer(0),last:true});
  }
  await send({type:'end'});if(signal?.aborted)throw aborted();if(!final)throw new Error('ZIP 未完成，请逐首下载。');
  return new Blob(chunks,{type:'application/zip'});
 }finally{signal?.removeEventListener('abort',abort);worker.terminate();pending=null;chunks.length=0;}
}
