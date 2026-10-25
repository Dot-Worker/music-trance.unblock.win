export const LIMITS = Object.freeze({file:64*1024*1024,batch:256*1024*1024,count:20,database:32*1024*1024,zip:256*1024*1024});
export function formatBytes(bytes) { return bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KiB` : `${(bytes/1024/1024).toFixed(1)} MiB`; }
export function safeOutputName(input, extension, used=new Set()) {
  const ext=String(extension||'bin').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,12)||'bin';
  let stem=String(input||'audio').split(/[\\/]/).pop().replace(/\.[^.]*$/,'').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,100)||'audio';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem=`_${stem}`;
  let name=`${stem}-converted.${ext}`,i=2;
  while(used.has(name.toLocaleLowerCase())) name=`${stem}-converted-${i++}.${ext}`;
  used.add(name.toLocaleLowerCase()); return name;
}
export function validateAddition(existing, incoming) {
  const accepted=[],errors=[];let count=existing.length,total=existing.reduce((n,f)=>n+f.size,0);
  for(const file of incoming) {
    if(!file.size) { errors.push(`${file.name}：文件为空。`);continue; }
    if(file.size>LIMITS.file) {errors.push(`${file.name}：超过 64 MiB 单文件限制。`);continue;}
    if(count>=LIMITS.count) {errors.push('队列最多 20 个文件，请先清空或移除部分文件。');break;}
    if(total+file.size>LIMITS.batch) {errors.push(`${file.name}：超过 256 MiB 批次限制。`);continue;}
    accepted.push(file);count++;total+=file.size;
  } return {accepted,errors};
}
