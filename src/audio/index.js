import { MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, OUTPUT_GUARD_BYTES } from './limits.js';
import { conversionPlan, outputName, audioInfoFromProbe } from './presets.js';
export { PRESETS, conversionPlan, outputName, audioInfoFromProbe } from './presets.js';
export { sniffAudio, parseWav } from './probe.js';
export const ENGINE_DOWNLOAD_BYTES = typeof __AUDIO_DOWNLOAD_BYTES__==='undefined'?0:__AUDIO_DOWNLOAD_BYTES__;
export const MAX_AUDIO_BYTES = MAX_INPUT_BYTES;
const coreDirectory=typeof __AUDIO_CORE_DIRECTORY__==='undefined'?'vendor/core-not-built':__AUDIO_CORE_DIRECTORY__;
const wrapperDirectory=typeof __AUDIO_WRAPPER_DIRECTORY__==='undefined'?'vendor/ffmpeg-0.12.15-test':__AUDIO_WRAPPER_DIRECTORY__;
const apeDirectory=typeof __APE_CORE_DIRECTORY__==='undefined'?'vendor/ape-not-built':__APE_CORE_DIRECTORY__;
export function apeSourceDownloadURL(){return runtimeAsset(typeof __APE_SOURCE_PATH__==='undefined'?'ape-source-not-built':__APE_SOURCE_PATH__);}
export function sourceDownloadURL(){ return runtimeAsset(typeof __AUDIO_SOURCE_PATH__==='undefined'?'source-not-built':__AUDIO_SOURCE_PATH__); }
const aborted=()=>new DOMException('Conversion canceled.','AbortError');
export function runtimeAsset(path) {
 return new URL(`${import.meta.env.BASE_URL}${path}`,document.baseURI).href;
}
/** Sequential engine: no network uploads, no shared memory or COOP/COEP required. */
export function createAudioEngine({createFFmpeg, assetURL=runtimeAsset, encodeApeImpl}={}) {
 let ffmpeg=null, busy=false, generation=0, apeController=null;
 const cancel=()=>{ generation++; apeController?.abort();apeController=null; if(ffmpeg) { ffmpeg.terminate(); ffmpeg=null; } };
 return {
  cancel, dispose:cancel,
  async convert(bytes,{preset,quality,sampleRate='source',maxOutputBytes=MAX_OUTPUT_BYTES,name='audio',signal,onProgress=()=>{},onStatus=()=>{},onSourceInfo=()=>{}}={}) {
   if(busy) throw new Error('A conversion is already running. Wait for it or cancel it first.');
   if(signal?.aborted) throw aborted();
   if(!(bytes instanceof Uint8Array)||!bytes.length) throw new Error('The audio file is empty or invalid.');
   if(bytes.byteLength>MAX_AUDIO_BYTES) throw new Error('This browser build limits each input to 256 MiB to reduce memory failures.');
   let plan;
   const files=new Set(['input.bin','source-probe.json','output-probe.json']);
   busy=true;
   const epoch=generation;
   let active=null;
   const abort=()=>cancel();
   const progress=({progress})=>onProgress(Math.max(0,Math.min(1,Number(progress)||0)));
   try {
    signal?.addEventListener('abort',abort,{once:true});
    if(!ffmpeg) {
     onStatus(`Loading local conversion engine (~${(ENGINE_DOWNLOAD_BYTES/1024/1024).toFixed(1)} MiB on first use)…`);
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
    bytes=null; // Browser wrapper transfers ownership; do not retain source after MEMFS write.
    const remove=async path=>{await active.deleteFile(path);files.delete(path);};
    const probe=async(path,destination)=>{
     const status=await active.ffprobe(['-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0','-show_entries','stream=codec_type,codec_name,sample_rate,channels,sample_fmt,bits_per_raw_sample,bits_per_sample,bit_rate,channel_layout,duration:format=duration','-of','json','-o',destination,path],30000);
     if(status!==0) throw new Error('读取音轨信息超时或失败。');
     const raw=await active.readFile(destination,'utf8');
     return audioInfoFromProbe(JSON.parse(typeof raw==='string'?raw:new TextDecoder().decode(raw)));
    };
    onStatus('正在读取音源参数…');
    const sourceInfo=await probe('input.bin','source-probe.json');
    if(signal?.aborted || epoch!==generation) throw aborted();
    onSourceInfo(sourceInfo);
    plan=conversionPlan(preset,{quality,sampleRate,maxOutputBytes},sourceInfo);files.add(plan.output);
    onStatus('正在本地转码…');
    const code=await active.exec(plan.args,600000);
    if(code!==0) throw new Error('The audio could not be decoded or encoded. It may be damaged, unsupported, or too large for this browser.');
    if(signal?.aborted||epoch!==generation)throw aborted();
    await remove('input.bin');
    if(preset==='ape') {
     const {validateApeWav}=await import('./ape-wav.js');
     const digest=async wav=>{const description=validateApeWav(wav);if(!globalThis.crypto?.subtle)throw new Error('APE 无损校验需要支持 WebCrypto 的 HTTPS 浏览器。');const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',wav.subarray(description.dataOffset,description.dataOffset+description.dataBytes)));return {description,hash};};
     let prepared=await active.readFile(plan.output);
     if(prepared.byteLength>=MAX_OUTPUT_BYTES-OUTPUT_GUARD_BYTES)throw new Error('APE 中间音频超过 512 MiB 安全限制，请选择较短音频。');
     await remove(plan.output); // Release MEMFS PCM before hashing / passing to the APE worker.
     const reference=await digest(prepared);
     if(signal?.aborted||epoch!==generation||active!==ffmpeg)throw aborted();
     if(reference.description.sampleRate!==plan.expected.sampleRate||reference.description.channels!==plan.expected.channels||reference.description.bits!==plan.expected.bitsPerSample)throw new Error('APE 中间音频参数不匹配。');
     apeController=new AbortController();
     if(signal?.aborted||epoch!==generation)throw aborted();
     onStatus('正在本地编码 APE…');
     const encode=encodeApeImpl||(await import('./ape-encoder.js')).encodeApe;
     const ape=await encode(prepared,{transferOwnership:true,signal:apeController.signal,onStatus,coreURL:assetURL(`${apeDirectory}/ape.js`),wasmURL:assetURL(`${apeDirectory}/ape.wasm`)});
     apeController=null;prepared=null;
     if(signal?.aborted||epoch!==generation)throw aborted();
     if(!(ape instanceof Uint8Array)||ape.byteLength<4||ape.byteLength>=plan.maxOutputBytes-OUTPUT_GUARD_BYTES)throw new Error('APE 输出为空或超过 512 MiB 安全限制。');
     files.add(plan.finalOutput);await active.writeFile(plan.finalOutput,ape);
     onStatus('正在校验 APE 无损音频…');
     const checked='ape-check.wav';files.add(checked);
     const status=await active.exec(['-protocol_whitelist','file,pipe','-i',plan.finalOutput,'-map','0:a:0','-vn','-map_metadata','-1','-c:a',plan.expected.bitsPerSample===16?'pcm_s16le':'pcm_s24le','-fs',String(MAX_OUTPUT_BYTES),checked],600000);
     if(signal?.aborted||epoch!==generation||active!==ffmpeg)throw aborted();
     if(status!==0)throw new Error('APE 解码校验失败，已拒绝导出。');
     let decoded=await active.readFile(checked);
     await remove(checked);
     if(decoded.byteLength>=MAX_OUTPUT_BYTES-OUTPUT_GUARD_BYTES)throw new Error('APE 校验音频超出安全限制。');
     const verification=await digest(decoded);
     if(signal?.aborted||epoch!==generation||active!==ffmpeg)throw aborted();
     if(verification.description.sampleRate!==reference.description.sampleRate||verification.description.channels!==reference.description.channels||verification.description.bits!==reference.description.bits||verification.description.dataBytes!==reference.description.dataBytes||!reference.hash.every((value,i)=>value===verification.hash[i]))throw new Error('APE 音频与输入 PCM 不一致，已拒绝导出。');
     decoded=null;
    }
    const audioInfo=await probe(plan.finalOutput,'output-probe.json');
    if(audioInfo.sampleRate!==plan.expected.sampleRate||audioInfo.channels!==plan.expected.channels||audioInfo.codec!==plan.expected.codec||(plan.expected.bitsPerSample&&audioInfo.bitsPerSample!==plan.expected.bitsPerSample)) throw new Error('实际输出参数与所选参数不符，已拒绝导出。');
    if(preset==='mp3'&&audioInfo.bitRate!==Number(plan.quality)*1000) throw new Error('此音源采样率无法达到所选 MP3 码率，请选择 44.1 / 48 kHz。');
    const result=await active.readFile(plan.finalOutput);
    if(signal?.aborted || epoch!==generation || active!==ffmpeg) throw aborted();
    if(result.byteLength>=plan.maxOutputBytes-OUTPUT_GUARD_BYTES) throw new Error('Output exceeds the available result budget (maximum 512 MiB). Choose MP3/AAC or a shorter source. No truncated output was exported.');
    if(!(result instanceof Uint8Array)||!result.length) throw new Error('The converter returned an empty output.');
    return {bytes:result,extension:plan.preset.extension,mime:plan.preset.mime,name:outputName(name,plan.preset.extension),audioInfo,sourceInfo};
   } catch(error) {
    if(signal?.aborted || epoch!==generation || (active&&active!==ffmpeg)) throw aborted();
    cancel(); // Memory/runtime errors cannot leave a poisoned worker for the next file.
    throw new Error(`Local conversion failed: ${error?.message||'Browser engine unavailable.'}`,{cause:error});
   } finally {
    signal?.removeEventListener('abort',abort);
    if(active===ffmpeg&&active) {
     active.off('progress',progress);
     // Remove even partially written output after a failure; cancellation destroys all MEMFS.
     const cleanup=await Promise.allSettled([...files].map(file=>active.deleteFile(file)));
     if(cleanup.some(r=>r.status==='rejected')) cancel();
    }
    busy=false;
   }
  }
 };
}
