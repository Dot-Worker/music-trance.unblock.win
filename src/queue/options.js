export const QUALITY_OPTIONS = Object.freeze({
 copy:[['source','保持音源']],
 mp3:[['128','128 kbps'],['192','192 kbps'],['256','256 kbps'],['320','320 kbps']],
 wav:[['source','跟随音源位深'],['16','16-bit PCM'],['24','24-bit PCM'],['32float','32-bit 浮点']],
 flac:[['source','跟随音源位深'],['16','16-bit 无损'],['24','24-bit 无损']],
 ape:[['source','跟随音源位深'],['16','16-bit 无损'],['24','24-bit 无损']],
 aac:[['256','256 kbps'],['320','320 kbps'],['512','512 kbps']]
});
export function defaultQuality(format){return format==='mp3'||format==='aac'?'320':'source';}
export function conversionOptions(format,quality,sampleRate){
 if(!Object.hasOwn(QUALITY_OPTIONS,format))throw new Error('不支持的输出格式');
 if(!QUALITY_OPTIONS[format].some(([value])=>value===quality))throw new Error('不支持的音质选项');
 if(!['source','44100','48000'].includes(sampleRate))throw new Error('不支持的采样率');
 return {preset:format,quality:format==='copy'?'source':quality,sampleRate:format==='copy'?'source':sampleRate};
}
export function audioInfoText(info){
 if(!info||typeof info!=='object')return '';
 const parts=[];
 if(typeof info.codec==='string'&&info.codec)parts.push(info.codec.toUpperCase());
 if(Number.isFinite(info.sampleRate)&&info.sampleRate>0)parts.push(`${info.sampleRate/1000} kHz`);
 if(Number.isFinite(info.bitsPerSample)&&info.bitsPerSample>0)parts.push(`${info.bitsPerSample}-bit${info.isFloat?' 浮点':''}${info.isFloat&&!String(info.codec||'').startsWith('pcm_')?'（解码）':''}`);
 if(Number.isFinite(info.channels)&&info.channels>0)parts.push(`${info.channels} 声道`);
 return parts.join(' · ');
}
