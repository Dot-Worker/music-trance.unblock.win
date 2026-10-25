import {createAudioEngine,ENGINE_DOWNLOAD_BYTES,sourceDownloadURL,apeSourceDownloadURL} from './audio/index.js';
import {LIMITS,formatBytes,safeOutputName,validateAddition,retainedBytes,remainingResultBytes,assertResultBudget} from './queue/files.js';
import {createZipArchive} from './queue/zip.js';
import {QUALITY_OPTIONS,defaultQuality,conversionOptions,audioInfoText} from './queue/options.js';
const $=id=>document.getElementById(id);
const nodes=Object.fromEntries(['files','dropzone','queue','queue-count','queue-memory','empty-state','notice','clear','start','start-label','cancel','download-all','ready-count','mode','quality','quality-note','sample-rate','format-label','format-tag','format-description','format-rate','settings-fields','database','db-status','master-key','demo'].map(id=>[id,$(id)]));
let queue=[],busy=false,generation=0,dbBytes=null,dbGeneration=0,worker=null,workerReject=null,controller=null,zipController=null,zipBusy=false,demoBusy=false,engineBusy=false;
const engine=createAudioEngine();
const archiveURLs=new Set();
function revokeArchives(){for(const url of archiveURLs)URL.revokeObjectURL(url);archiveURLs.clear();}
const base=path=>new URL(`${import.meta.env.BASE_URL}${path}`,document.baseURI).href;
$('core-source-link').href=sourceDownloadURL();
$('ape-source-link').href=apeSourceDownloadURL();
$('license-link').href=base('THIRD_PARTY_NOTICES.txt');
const notices=message=>{nodes.notice.textContent=message;nodes.notice.hidden=!message;};
function updatePreset(resetQuality=false){
 const format=nodes.mode.value,copy=format==='copy';
 if(resetQuality||!nodes.quality.options.length){nodes.quality.replaceChildren();for(const [value,label] of QUALITY_OPTIONS[format]){const option=document.createElement('option');option.value=value;option.textContent=label;nodes.quality.append(option);}nodes.quality.value=defaultQuality(format);}
 nodes.quality.disabled=copy;nodes['sample-rate'].disabled=copy;if(copy)nodes['sample-rate'].value='source';
 const qualityLabel=QUALITY_OPTIONS[format].find(([value])=>value===nodes.quality.value)?.[1]||'';
 nodes['format-label'].textContent=copy?'原格式':format.toUpperCase();
 nodes['format-tag'].textContent=copy?'ORIGINAL':['wav','flac','ape'].includes(format)?'LOSSLESS':'AUDIO';
 nodes['format-description'].textContent=copy?'不重新编码':`${['mp3','aac'].includes(format)?'目标 ':''}${qualityLabel}`;
 nodes['format-rate'].textContent=copy?'保留音源参数':nodes['sample-rate'].value==='source'?'采样率跟随每个音源':`${Number(nodes['sample-rate'].value)/1000} kHz`;
 nodes['quality-note'].textContent=copy?'仅解密保留源音频，不重新编码。':format==='ape'?'APE 无损 · 仅单 / 双声道；浮点音源请明确选择 16 / 24-bit。':'更高码率 / 位深不会恢复已丢失的音质。';
}
nodes.mode.addEventListener('change',()=>updatePreset(true));nodes.quality.addEventListener('change',()=>updatePreset());nodes['sample-rate'].addEventListener('change',()=>updatePreset());updatePreset(true);
function makeText(tag,cls,text){const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;}
function render(){
 const ready=queue.filter(item=>item.status==='done');
 nodes['queue-count'].textContent=queue.length;nodes['queue-memory'].textContent=`结果 ${formatBytes(retainedBytes(queue))} / ${formatBytes(LIMITS.results)}`;nodes['empty-state'].hidden=queue.length>0;
 nodes.clear.disabled=queue.length===0&&!dbBytes&&!nodes['master-key'].value&&!zipBusy;
 nodes.start.disabled=busy||zipBusy||engineBusy||!queue.some(item=>['queued','error','cancelled'].includes(item.status));
 nodes['start-label'].textContent=busy?'正在本地处理…':queue.some(i=>i.status==='error'||i.status==='cancelled')?'转换 / 重试未完成':'开始转换';
 nodes.cancel.hidden=!busy&&!zipBusy;nodes.cancel.textContent=zipBusy?'停止打包':'停止转换';nodes['download-all'].disabled=busy||zipBusy||!ready.length;
 nodes['download-all'].firstChild.textContent=zipBusy?'正在打包…':'打包下载 ZIP ';
 nodes['ready-count'].textContent=ready.length?`(${ready.length})`:'';
 nodes['settings-fields'].disabled=busy;nodes.files.disabled=busy||zipBusy;nodes.demo.disabled=busy||zipBusy||demoBusy;nodes.dropzone.classList.toggle('disabled',busy||zipBusy);nodes.dropzone.setAttribute('aria-disabled',String(busy||zipBusy));
 nodes.queue.replaceChildren();
 for(const item of queue){const li=document.createElement('li');li.className='queue-item';li.dataset.status=item.status;
  li.append(makeText('span','file-icon',item.status==='done'?'✓':'♫'));
  const body=document.createElement('div');body.append(makeText('h4','file-title',item.file.name));body.append(makeText('div','file-info',`${formatBytes(item.file.size)}${item.outputName?` → ${item.outputName} · ${formatBytes(item.blob.size)}`:''}`));
  if(item.sourceInfo)body.append(makeText('div','file-info',`音源：${audioInfoText(item.sourceInfo)}`));
  body.append(makeText('p','file-status',item.message||'等待转换'));
  if(item.status==='working'){const progress=document.createElement('progress');progress.className='job-progress';progress.max=1;if(Number.isFinite(item.progress))progress.value=item.progress;progress.setAttribute('aria-label',`${item.file.name} 转换进度`);body.append(progress);}
  li.append(body);const actions=document.createElement('div');actions.className='file-actions';
  if(item.status==='done'){const button=makeText('button','download','下载');button.type='button';button.setAttribute('aria-label',`下载 ${item.outputName}`);button.onclick=()=>save(item.url,item.outputName);actions.append(button);}
  const remove=makeText('button','remove',item.status==='done'?'释放':'×');remove.type='button';remove.title=item.status==='done'?'请先下载；释放会移除结果与队列项':'移除';remove.setAttribute('aria-label',`移除并释放 ${item.file.name}`);remove.disabled=busy||zipBusy;remove.onclick=()=>{revoke(item);queue=queue.filter(i=>i!==item);render();};actions.append(remove);li.append(actions);nodes.queue.append(li);
 }
}
function addFiles(files){if(busy||zipBusy)return;const {accepted,errors}=validateAddition(queue.map(i=>i.file),Array.from(files));for(const file of accepted)queue.push({file,status:'queued',message:'等待转换'});notices(errors.join('\n')||(accepted.length?`已添加 ${accepted.length} 个文件。请选择输出格式。`:''));render();}
nodes.files.addEventListener('change',()=>{addFiles(nodes.files.files);nodes.files.value='';});
nodes.dropzone.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!busy&&!zipBusy)nodes.files.click();}});
for(const event of ['dragenter','dragover'])nodes.dropzone.addEventListener(event,e=>{e.preventDefault();if(!busy&&!zipBusy)nodes.dropzone.classList.add('drag-over');});
for(const event of ['dragleave','drop'])nodes.dropzone.addEventListener(event,e=>{e.preventDefault();nodes.dropzone.classList.remove('drag-over');if(event==='drop')addFiles(e.dataTransfer.files);});
// Never navigate to a local file dropped outside the drop zone.
window.addEventListener('dragover',event=>event.preventDefault());window.addEventListener('drop',event=>event.preventDefault());
nodes.database.addEventListener('change',async()=>{const file=nodes.database.files[0],token=++dbGeneration;dbBytes=null;if(!file){nodes['db-status'].textContent='未选择数据库';render();return;}if(file.size>LIMITS.database){nodes.database.value='';nodes['db-status'].textContent='数据库超过 32 MiB 限制，请选择较小数据库。';render();return;}try{const bytes=await file.arrayBuffer();if(token!==dbGeneration)return;dbBytes=bytes;nodes['db-status'].textContent=`已载入 ${file.name} · ${formatBytes(file.size)}`;}catch{if(token!==dbGeneration)return;nodes['db-status'].textContent='读取失败，请重新选择数据库。';}render();});
nodes['master-key'].addEventListener('input',render);
function decrypt(bytes,file,key){return new Promise((resolve,reject)=>{worker=new Worker(new URL('./queue/decrypt-worker.js',import.meta.url),{type:'module'});workerReject=reject;const current=worker;const finish=()=>{current.terminate();if(worker===current){worker=null;workerReject=null;}};current.onmessage=({data})=>{finish();if(data.ok)resolve(data);else{const error=new Error(data.error.message);error.code=data.error.code;reject(error);}};current.onerror=()=>{finish();reject(new Error('本地解密引擎无法运行，请重新加载页面后重试。'));};const message={bytes,name:file.name,dbBytes:dbBytes?dbBytes.slice(0):null,masterKeyHex:key,sqlWasmUrl:base('vendor/sql.js-1.15.1/sql-wasm.wasm')};const transfers=[bytes];if(message.dbBytes)transfers.push(message.dbBytes);current.postMessage(message,transfers);});}
function revoke(item){if(item.url)URL.revokeObjectURL(item.url);item.url=null;item.blob=null;}
function stop(){generation++;controller?.abort();engine.cancel();worker?.terminate();worker=null;workerReject?.(new DOMException('已停止','AbortError'));workerReject=null;for(const item of queue)if(item.status==='working'){item.status='cancelled';item.message='已停止，可重新转换';item.progress=undefined;}busy=false;controller=null;render();}
nodes.cancel.addEventListener('click',()=>{if(zipBusy){zipController?.abort();notices('已停止打包，原有结果仍可逐首下载。');return;}stop();notices('已停止转换。成功的文件仍可下载，未完成文件可重试。');});
nodes.clear.addEventListener('click',()=>{stop();zipController?.abort();zipController=null;zipBusy=false;revokeArchives();for(const item of queue)revoke(item);queue=[];dbGeneration++;dbBytes=null;nodes.database.value='';nodes['master-key'].value='';nodes['db-status'].textContent='未选择数据库';notices('队列、输出及本页中的数据库与密钥已清除。');render();});
nodes.start.addEventListener('click',async()=>{
 if(busy||zipBusy||engineBusy)return;const pending=queue.filter(item=>['queued','error','cancelled'].includes(item.status));if(!pending.length)return;
 const key=nodes['master-key'].value.trim();if(key&&!/^[0-9a-f]{64}$/i.test(key)){notices('数据库主密钥必须是 64 位十六进制字符，或留空。');nodes['master-key'].focus();return;}
 const run=++generation;busy=true;controller=new AbortController();const signal=controller.signal;
 const options=conversionOptions(nodes.mode.value,nodes.quality.value,nodes['sample-rate'].value),preset=options.preset;
 const names=new Set(queue.filter(i=>i.outputName).map(i=>i.outputName.toLocaleLowerCase()));notices('转换在本地顺序执行；请保持页面打开。');render();
 for(const item of pending){if(run!==generation)break;item.status='working';item.message='正在读取并解密…';item.progress=undefined;render();
  try{if(!remainingResultBytes(queue))throw new Error('结果内存预算已用满，请下载并释放已有结果后重试。');const input=await item.file.arrayBuffer();if(run!==generation)break;const decoded=await decrypt(input,item.file,key);if(run!==generation)break;
   let output={bytes:decoded.audio,extension:decoded.extension,mime:'application/octet-stream'};
   if(preset!=='copy'){item.message='正在加载 / 运行本地音频引擎…';render();engineBusy=true;try{output=await engine.convert(decoded.audio,{...options,maxOutputBytes:remainingResultBytes(queue),name:item.file.name,signal,onSourceInfo:info=>{if(run!==generation)return;item.sourceInfo=info;render();},onProgress:progress=>{if(run!==generation)return;item.progress=typeof progress==='number'?Math.max(0,Math.min(1,progress)):undefined;render();},onStatus:status=>{if(run!==generation)return;item.message=String(status).startsWith('Loading')?`正在加载本站音频引擎（首次约 ${(ENGINE_DOWNLOAD_BYTES/1024/1024).toFixed(1)} MiB）…`:'正在本地转码…';render();}});}finally{engineBusy=false;render();}}
   if(run!==generation)break;if(output.audioInfo)item.outputInfo=output.audioInfo;assertResultBudget(queue,output.bytes.byteLength);const blob=new Blob([output.bytes],{type:output.mime});if(!blob.size)throw new Error('引擎返回了空文件，未生成下载。');item.blob=blob;item.outputName=safeOutputName(item.file.name,output.extension,names);item.url=URL.createObjectURL(blob);item.status='done';item.message=preset==='copy'?'解密完成 · 保留源音频':`转换完成${audioInfoText(item.outputInfo)?` · ${audioInfoText(item.outputInfo)}`:''}`;item.progress=1;
  }catch(error){if(run!==generation)break;item.status='error';item.progress=undefined;item.message=error.code==='NEED_QQ_EKEY'?'NEED_QQ_EKEY：此 QQ 文件缺少必要 ekey，当前无法解密。':`${error.code?`${error.code}：`:''}${error.message||'转换失败，请检查文件格式。'}`;}
  render();
 }
 if(run===generation){busy=false;controller=null;const done=queue.filter(i=>i.status==='done').length,failed=queue.filter(i=>i.status==='error').length;notices(`本轮处理结束：${done} 个文件可下载${failed?`，${failed} 个失败（可查看原因后重试）`:''}。关闭页面前请保存结果。`);render();}
});
function save(url,name){const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
nodes['download-all'].addEventListener('click',async()=>{
 if(busy||zipBusy)return;const outputs=queue.filter(item=>item.status==='done').map(({outputName,blob})=>({outputName,blob}));if(!outputs.length)return;
 revokeArchives();zipBusy=true;zipController=new AbortController();const current=zipController,run=generation;render();
 try{const archive=await createZipArchive(outputs,{signal:current.signal});if(run!==generation||current.signal.aborted)return;
 const url=URL.createObjectURL(archive);archiveURLs.add(url);save(url,'music-trance.zip');setTimeout(()=>{URL.revokeObjectURL(url);archiveURLs.delete(url);},60000);notices('ZIP 已交给浏览器下载。下载后可释放队列结果。');
 }catch(error){if(run===generation&&!current.signal.aborted)notices(error.message||'打包失败，请逐首下载。');}finally{if(zipController===current){zipController=null;zipBusy=false;render();}}
});
nodes.demo.addEventListener('click',async()=>{if(busy||zipBusy||demoBusy)return;demoBusy=true;const run=generation;render();try{const response=await fetch(base('demo/plain.wav'));if(!response.ok)throw new Error('示例加载失败');const blob=await response.blob();if(run!==generation)return;addFiles([new File([blob],'demo-440hz.wav',{type:'audio/wav'})]);notices('已添加本站 440 Hz 合成测试音（非真实音乐、非加密文件），用于体验本地转码与下载。');}catch{if(run===generation)notices('无法加载本站合成示例，请选择本地文件。');}finally{demoBusy=false;render();}});
window.addEventListener('pagehide',()=>{stop();zipController?.abort();zipController=null;engine.dispose();for(const item of queue)revoke(item);queue=[];dbGeneration++;dbBytes=null;nodes.database.value='';nodes['db-status'].textContent='未选择数据库';nodes['master-key'].value='';zipBusy=false;revokeArchives();notices('');render();});
render();
