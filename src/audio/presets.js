/** Format choices describe encoding, never a claim that conversion improves the source. */
export const PRESETS=Object.freeze([
 {id:'mp3',label:'MP3',extension:'mp3',mime:'audio/mpeg',description:'128 / 192 / 256 / 320 kbps target'},
 {id:'wav',label:'WAV',extension:'wav',mime:'audio/wav',description:'Source precision, PCM16 / PCM24 / Float32'},
 {id:'flac',label:'FLAC',extension:'flac',mime:'audio/flac',description:'Lossless integer PCM, up to 24-bit'},
 {id:'ape',label:'APE',extension:'ape',mime:'audio/x-ape',description:'Lossless integer PCM16/24, mono/stereo, normal compression'},
 {id:'aac',label:'AAC / M4A',extension:'m4a',mime:'audio/mp4',description:'AAC-LC, 256 / 320 / 512 kbps target'}
]);
export function audioInfoFromProbe(value) {
 const stream=value?.streams?.find(s=>s.codec_type==='audio');
 if(!stream) throw new Error('没有可解码的音轨。');
 const sampleRate=Number(stream.sample_rate),channels=Number(stream.channels);
 if(!Number.isInteger(sampleRate)||sampleRate<=0||!Number.isInteger(channels)||channels<1||channels>64) throw new Error('无法读取音源采样率或声道数。');
 const sampleFormat=String(stream.sample_fmt||'');
 const isFloat=/^(flt|dbl)/.test(sampleFormat);
 const decodedBits=sampleFormat.startsWith('dbl')?64:sampleFormat.startsWith('flt')?32:sampleFormat.startsWith('s32')?32:sampleFormat.startsWith('s16')?16:sampleFormat.startsWith('u8')?8:0;
 const bitsPerSample=Number(stream.bits_per_raw_sample)||Number(stream.bits_per_sample)||decodedBits;
 return {codec:stream.codec_name,sampleRate,channels,bitsPerSample,sampleFormat,isFloat,bitRate:Number(stream.bit_rate)||null,channelLayout:stream.channel_layout||null};
}
export function conversionPlan(id,{quality,sampleRate='source'}={},source,input='input.bin') {
 const preset=PRESETS.find(p=>p.id===id);
 if(!preset) throw new Error('未知输出格式。');
 if(!source?.sampleRate||!source?.channels) throw new Error('必须先读取实际音源信息，不能猜测采样率。');
 if(!['source','44100','48000'].includes(String(sampleRate))) throw new Error('采样率选项无效。');
 const rate=String(sampleRate)==='source'?source.sampleRate:Number(sampleRate);
 const channels=source.channels;
 quality=String(quality??(['mp3','aac'].includes(id)?'320':'source'));
 const args=['-protocol_whitelist','file,pipe','-i',input,'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-ar',String(rate),'-ac',String(channels)];
 let codec,bits=null;
 if(id==='mp3') {
  if(!['128','192','256','320'].includes(quality)) throw new Error('MP3 码率选项无效。');
  if(![8000,11025,12000,16000,22050,24000,32000,44100,48000].includes(rate)) throw new Error(`MP3 不支持音源的 ${rate} Hz；请选择 44.1 / 48 kHz，或使用 WAV / FLAC。`);
  if(channels>2) throw new Error('MP3 仅支持单声道 / 双声道；不会自动混缩多声道音源，请选择 WAV / FLAC。');
  if(rate<32000&&Number(quality)>160) throw new Error('此 MP3 码率不支持音源的低采样率；请选择 44.1 / 48 kHz 或无损格式。');
  codec='libmp3lame';args.push('-c:a',codec,'-b:a',`${quality}k`,'-id3v2_version','3','-write_id3v1','0');
 } else if(id==='aac') {
  if(!['256','320','512'].includes(quality)) throw new Error('AAC 目标码率选项无效。');
  if(![7350,8000,11025,12000,16000,22050,24000,32000,44100,48000,64000,88200,96000].includes(rate)) throw new Error(`AAC 不支持音源的 ${rate} Hz；请选择 44.1 / 48 kHz，或使用 WAV / FLAC。`);
  if(channels>8) throw new Error('AAC 不支持该声道数；请保留音源或选择 WAV。');
  if(Number(quality)*1000>rate*channels*6) throw new Error('AAC 目标码率超过此采样率 / 声道数的编码上限；请选择较低码率、44.1 / 48 kHz，或 WAV / FLAC。');
  codec='aac';args.push('-c:a',codec,'-profile:a','aac_low','-b:a',`${quality}k`,'-movflags','+faststart');
 } else if(id==='wav') {
  if(!['source','16','24','32float'].includes(quality)) throw new Error('WAV 位深选项无效。');
  if(quality==='source') {
   if(!source.bitsPerSample||source.bitsPerSample>32) throw new Error('该音源精度无法自动保留；请选择仅解密，或明确指定输出位深。');
   codec=source.isFloat?'pcm_f32le':source.bitsPerSample<=16?'pcm_s16le':source.bitsPerSample<=24?'pcm_s24le':'pcm_s32le';
  } else codec=quality==='16'?'pcm_s16le':quality==='24'?'pcm_s24le':'pcm_f32le';
  bits=codec.includes('16')?16:codec.includes('24')?24:32;
  args.push('-c:a',codec);
 } else {
  if(!['source','16','24'].includes(quality)) throw new Error('无损格式位深选项无效。');
  if(id==='ape'&&(channels>2||rate<8000||rate>384000)) throw new Error('APE 支持 16 / 24 位单声道或双声道、8–384 kHz；不会自动混缩声道。');
  if(channels>8) throw new Error('FLAC 最多支持 8 声道；请选择 WAV。');
  if(quality==='source'&&(source.isFloat||!source.bitsPerSample||source.bitsPerSample>24)) throw new Error(`${id.toUpperCase()} 无法原样保留浮点或超过 24 位的精度；请选择 WAV，或明确选择 16 / 24 位。`);
  bits=quality==='source'?(source.bitsPerSample<=16?16:24):Number(quality);
  if(id==='ape'){codec='ape';args.push('-c:a',bits===16?'pcm_s16le':'pcm_s24le');}
  else {codec='flac';args.push('-c:a','flac','-sample_fmt',bits===16?'s16':'s32','-bits_per_raw_sample',String(bits),'-compression_level','8');}
 }
 const output=id==='ape'?'ape-prepared.wav':`output.${preset.extension}`;
 const finalOutput=id==='ape'?'output.ape':output;
 return {finalOutput,preset,args:[...args,'-fs','134217728',output],output,expected:{sampleRate:rate,channels,bitsPerSample:bits,codec:codec==='libmp3lame'?'mp3':codec},quality};
}
export function outputName(name,extension) {
 const stem=String(name||'audio').replace(/\.[^.]*$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,180)||'audio';
 return `${stem}.${extension}`;
}
