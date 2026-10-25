import {MAX_INPUT_BYTES,MAX_BATCH_BYTES,MAX_RETAINED_BYTES,MAX_ZIP_BYTES,MAX_FILES,MAX_DB_BYTES} from '../audio/limits.js';
export const LIMITS = Object.freeze({file:MAX_INPUT_BYTES,batch:MAX_BATCH_BYTES,results:MAX_RETAINED_BYTES,count:MAX_FILES,database:MAX_DB_BYTES,zip:MAX_ZIP_BYTES});
export function formatBytes(bytes) { return bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KiB` : `${(bytes/1024/1024).toFixed(1)} MiB`; }
export function safeOutputName(input, extension, used=new Set()) {
  const ext=String(extension||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,12)||'bin';
  let stem=String(input||'audio').split(/[\\/]/).pop().replace(/\.[^.]*$/,'').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,100)||'audio';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem=`_${stem}`;
  let name=`${stem}.${ext}`,i=2;
  while(used.has(name.toLocaleLowerCase())) name=`${stem}-${i++}.${ext}`;
  used.add(name.toLocaleLowerCase()); return name;
}
export function validateAddition(existing, incoming) {
  const accepted=[],errors=[];let count=existing.length,total=existing.reduce((n,f)=>n+f.size,0);
  for(const file of incoming) {
    if(!file.size) { errors.push(`${file.name}：文件为空。`);continue; }
    if(file.size>LIMITS.file) {errors.push(`${file.name}：超过 ${formatBytes(LIMITS.file)} 单文件限制。`);continue;}
    if(count>=LIMITS.count) {errors.push('队列最多 20 个文件，请先清空或移除部分文件。');break;}
    if(total+file.size>LIMITS.batch) {errors.push(`${file.name}：超过 ${formatBytes(LIMITS.batch)} 批次限制。`);continue;}
    accepted.push(file);count++;total+=file.size;
  } return {accepted,errors};
}

export function retainedBytes(items){return items.reduce((sum,item)=>sum+(item.blob?.size||0),0);}
export function remainingResultBytes(items){return Math.max(0,LIMITS.results-retainedBytes(items));}
export function assertResultBudget(items,bytes){if(!Number.isSafeInteger(bytes)||bytes<=0)throw new Error('输出为空或大小无效。');if(bytes>remainingResultBytes(items))throw new Error(`结果累计超过 ${formatBytes(LIMITS.results)} 内存预算，请先下载并释放已有结果，再重试。`);return bytes;}
