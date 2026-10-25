import { conversionPlan, outputName } from './presets.js';
export { PRESETS, conversionPlan, outputName } from './presets.js';
export { sniffAudio, parseWav } from './probe.js';
export const ENGINE_DOWNLOAD_BYTES = 2571734;
export const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const coreDirectory=typeof __AUDIO_CORE_DIRECTORY__==='undefined'?'vendor/core-not-built':__AUDIO_CORE_DIRECTORY__;
const wrapperDirectory=typeof __AUDIO_WRAPPER_DIRECTORY__==='undefined'?'vendor/ffmpeg-0.12.15-test':__AUDIO_WRAPPER_DIRECTORY__;
export function sourceDownloadURL(){ return runtimeAsset(typeof __AUDIO_SOURCE_PATH__==='undefined'?'source-not-built':__AUDIO_SOURCE_PATH__); }
const aborted=()=>new DOMException('Conversion canceled.','AbortError');
export function runtimeAsset(path) {
 return new URL(`${import.meta.env.BASE_URL}${path}`,document.baseURI).href;
}
/** Sequential engine: no network uploads, no shared memory or COOP/COEP required. */
export function createAudioEngine({createFFmpeg, assetURL=runtimeAsset}={}) {
 let ffmpeg=null, busy=false, generation=0;
 const cancel=()=>{ generation++; if(ffmpeg) { ffmpeg.terminate(); ffmpeg=null; } };
 return {
  cancel, dispose:cancel,
  async convert(bytes,{preset,name='audio',signal,onProgress=()=>{},onStatus=()=>{}}={}) {
   if(busy) throw new Error('A conversion is already running. Wait for it or cancel it first.');
   if(signal?.aborted) throw aborted();
   if(!(bytes instanceof Uint8Array)||!bytes.length) throw new Error('The audio file is empty or invalid.');
   if(bytes.byteLength>MAX_AUDIO_BYTES) throw new Error('This browser build limits each input to 64 MiB to reduce memory failures.');
   const plan=conversionPlan(preset);
   busy=true;
   const epoch=generation;
   let active=null;
   const abort=()=>cancel();
   const progress=({progress})=>onProgress(Math.max(0,Math.min(1,Number(progress)||0)));
   try {
    signal?.addEventListener('abort',abort,{once:true});
    if(!ffmpeg) {
     onStatus('Loading local conversion engine (~2.5 MiB on first use)…');
     const factory=createFFmpeg || (async()=>{const {FFmpeg}=await import(/* @vite-ignore */ assetURL(`${wrapperDirectory}/index.js`));return new FFmpeg();});
     active=await factory();
     if(signal?.aborted || epoch!==generation) { active.terminate(); throw aborted(); }
     ffmpeg=active;
     await active.load({classWorkerURL:assetURL(`${wrapperDirectory}/worker.js`),coreURL:assetURL(`${coreDirectory}/ffmpeg-core.js`),wasmURL:assetURL(`${coreDirectory}/ffmpeg-core.wasm`)});
    } else active=ffmpeg;
    if(signal?.aborted || epoch!==generation) throw aborted();
    active.on('progress',progress);
    onStatus('Converting audio locally…');
    await active.writeFile('input.bin',bytes);
    const code=await active.exec(plan.args,600000);
    if(code!==0) throw new Error('The audio could not be decoded or encoded. It may be damaged, unsupported, or too large for this browser.');
    const result=await active.readFile(plan.output);
    if(signal?.aborted || epoch!==generation || active!==ffmpeg) throw aborted();
    if(result.byteLength>=134217728-65536) throw new Error('Output exceeds this browser build’s 128 MiB safety limit. Choose MP3/AAC or a shorter source. No truncated output was exported.');
    if(!(result instanceof Uint8Array)||!result.length) throw new Error('The converter returned an empty output.');
    return {bytes:result,extension:plan.preset.extension,mime:plan.preset.mime,name:outputName(name,plan.preset.extension)};
   } catch(error) {
    if(signal?.aborted || epoch!==generation || (active&&active!==ffmpeg)) throw aborted();
    cancel(); // Memory/runtime errors cannot leave a poisoned worker for the next file.
    throw new Error(`Local conversion failed: ${error?.message||'Browser engine unavailable.'}`,{cause:error});
   } finally {
    signal?.removeEventListener('abort',abort);
    if(active===ffmpeg&&active) {
     active.off('progress',progress);
     // Remove even partially written output after a failure; cancellation destroys all MEMFS.
     const cleanup=await Promise.allSettled(['input.bin',plan.output].map(file=>active.deleteFile(file)));
     if(cleanup.some(r=>r.status==='rejected')) cancel();
    }
    busy=false;
   }
  }
 };
}
