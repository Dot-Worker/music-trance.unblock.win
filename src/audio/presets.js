/** Suggested settings inherited from the desktop project, NOT verified car compatibility. */
export const PRESETS = Object.freeze([
  {id:'aac-2010',label:'2010 · AAC / M4A',extension:'m4a',mime:'audio/mp4',description:'AAC-LC, target 320 kbps, stereo, 44.1 kHz'},
  {id:'wav-44100',label:'2011–2026 · WAV 44.1 kHz',extension:'wav',mime:'audio/wav',description:'PCM 16-bit, stereo, 44.1 kHz'},
  {id:'wav-48000',label:'2011–2026 · WAV 48 kHz',extension:'wav',mime:'audio/wav',description:'PCM 16-bit, stereo, 48 kHz'},
  {id:'mp3-compact',label:'Compact · MP3',extension:'mp3',mime:'audio/mpeg',description:'MP3, target 320 kbps, stereo, 44.1 kHz; ID3v2.3'}
]);
export function conversionPlan(id, input='input.bin') {
  const preset=PRESETS.find(p=>p.id===id);
  if (!preset) throw new Error('Unknown output preset.');
  // Always decode/re-encode: filename extensions do not establish codec/profile/bit depth.
  const args=['-protocol_whitelist','file,pipe,data','-i',input,'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-ac','2'];
  if (id.startsWith('wav-')) args.push('-ar',id==='wav-48000'?'48000':'44100','-c:a','pcm_s16le');
  if (id==='aac-2010') args.push('-ar','44100','-c:a','aac','-profile:a','aac_low','-b:a','320k','-movflags','+faststart');
  if (id==='mp3-compact') args.push('-ar','44100','-c:a','libmp3lame','-b:a','320k','-id3v2_version','3','-write_id3v1','0');
  const output=`output.${preset.extension}`;
  // -fs bounds MEMFS growth; the engine rejects near-cap outputs rather than exporting truncation.
  return {preset,args:[...args,'-fs','134217728',output],output};
}
export function outputName(name,extension) {
  const stem=String(name||'audio').replace(/\.[^.]*$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,180)||'audio';
  return `${stem}.${extension}`;
}
