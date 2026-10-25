// QA bridge executes the actual browser worker module under a Node worker thread.
import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);
globalThis.__dirname=new URL('../../artifacts/ape/',import.meta.url).pathname;
globalThis.self={postMessage:(data,trans=[])=>parentPort.postMessage(data,trans),location:{href:workerData.module}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=String(input);
 if(url.startsWith('file:'))return new Response(await readFile(fileURLToPath(url)),{status:200,headers:{'Content-Type':url.endsWith('.wasm')?'application/wasm':'application/octet-stream'}});
 return nativeFetch(input,init);
};
await import(workerData.module);
parentPort.on('message',data=>self.onmessage({data}));
