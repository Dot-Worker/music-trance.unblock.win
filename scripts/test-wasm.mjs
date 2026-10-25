// Runs the official single-thread WASM core under Node, not native FFmpeg.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { conversionPlan } from '../src/audio/presets.js';
import { parseWav, sniffAudio } from '../src/audio/probe.js';
const require=createRequire(import.meta.url);
globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
const factory=require('../artifacts/core/ffmpeg-core.cjs');
const wasm=await readFile(new URL('../artifacts/core/test-core.wasm',import.meta.url));
assert.deepEqual(wasm,await readFile(new URL('../artifacts/core/ffmpeg-core.wasm',import.meta.url)),'Test and browser WASM must be identical');
const core=await factory({wasmBinary:wasm});
const logs=[]; core.setLogger(({message})=>logs.push(message));
core.exec('-L');core.reset();
assert.ok(logs.join(' ').includes('GNU Lesser General Public License'),'Custom core must report LGPL');
logs.length=0;core.exec('-buildconf');core.reset();
const config=logs.join('\n');
assert.ok(config.includes('--disable-gpl') && config.includes('--disable-network'));
assert.ok(!config.includes('--enable-gpl') && !config.includes('--enable-nonfree'));
console.log('Verified own core: LGPL, GPL disabled, network disabled.');
logs.length=0;
const input=await readFile(new URL('../public/demo/plain.wav',import.meta.url));
for(const id of ['wav-44100','wav-48000','aac-2010','mp3-compact']) {
 const {args,output}=conversionPlan(id);
 core.FS.writeFile('input.bin',input);
 core.exec(...args);
 assert.equal(core.ret,0,logs.slice(-15).join('\n'));
 core.reset();
 const bytes=core.FS.readFile(output);
 assert.ok(bytes.length>0);
 if(id.startsWith('wav')) assert.deepEqual({...parseWav(bytes),dataBytes:0},{format:1,channels:2,sampleRate:id==='wav-48000'?48000:44100,bitsPerSample:16,dataBytes:0});
 if(id==='aac-2010') assert.equal(sniffAudio(bytes),'m4a');
 if(id==='mp3-compact') { assert.equal(sniffAudio(bytes),'mp3');assert.equal(bytes[3],3,'ID3 major version 3'); }
 core.ffprobe('-v','error','-show_streams','-of','json','-o','probe.json',output);
 assert.ok(core.FS.analyzePath('probe.json').exists,logs.slice(-20).join('\n'));core.reset();
 const probe=JSON.parse(core.FS.readFile('probe.json',{encoding:'utf8'}));
 const stream=probe.streams.find(s=>s.codec_type==='audio');
 assert.equal(stream.channels,2);
 if(id==='aac-2010'){assert.equal(stream.codec_name,'aac');assert.equal(stream.profile,'LC');}
 if(id==='mp3-compact'){assert.equal(stream.codec_name,'mp3');assert.equal(stream.bit_rate,'320000');}
 console.log(JSON.stringify({preset:id,bytes:bytes.length,codec:stream.codec_name,profile:stream.profile,sampleRate:stream.sample_rate,channels:stream.channels,bitRate:stream.bit_rate}));
 for(const file of ['input.bin',output,'probe.json'])core.FS.unlink(file);
}
console.log('PASS: four real WASM conversions, ffprobe validation, all fixture MEMFS files removed.');

// Decoder coverage: generate ONLY a short synthetic sine via system FFmpeg.
// Native FFmpeg creates fixtures; every conversion under test still runs our WASM.
const { spawnSync }=await import('node:child_process');
const { mkdtemp, rm }=await import('node:fs/promises');
const { tmpdir }=await import('node:os');
const { join }=await import('node:path');
const dir=await mkdtemp(join(tmpdir(),'music-synthetic-codecs-'));
const fixtures=[
 ['flac-24bit-96k','flac',['-c:a','flac','-sample_fmt','s32','-ar','96000']],
 ['mp3','mp3',['-c:a','libmp3lame','-b:a','320k','-ar','44100']],
 ['aac-m4a','m4a',['-c:a','aac','-profile:a','aac_low','-ar','44100']],
 ['aac-adts','aac',['-c:a','aac','-profile:a','aac_low','-ar','44100','-f','adts']],
 ['ogg-vorbis','ogg',['-c:a','libvorbis','-ar','48000']],
 ['ogg-opus','opus',['-c:a','libopus','-ar','48000']],
 ['wav-24bit-96k','wav',['-c:a','pcm_s24le','-ar','96000']],
 ['alac','m4a',['-c:a','alac','-ar','48000']],
 ['wma-v2','wma',['-c:a','wmav2','-ar','44100']]
];
try {
 for(const [label,extension,args] of fixtures) {
  const file=join(dir,`${label}.${extension}`);
  const generated=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=96000:duration=0.2','-ac','2',...args,file],{encoding:'utf8'});
  assert.equal(generated.status,0,`Native synthetic fixture generation failed (${label}): ${generated.error||generated.stderr}`);
  core.FS.writeFile('input.bin',await readFile(file));
  for(const preset of ['wav-44100','wav-48000']) {
   const plan=conversionPlan(preset); logs.length=0;core.exec(...plan.args);
   assert.equal(core.ret,0,`WASM decode failed (${label}→${preset}): ${logs.slice(-15).join('\n')}`);core.reset();
   const actual=parseWav(core.FS.readFile(plan.output));
   assert.equal(actual.format,1);assert.equal(actual.channels,2);assert.equal(actual.bitsPerSample,16);assert.equal(actual.sampleRate,preset==='wav-48000'?48000:44100);assert.ok(actual.dataBytes>0);
   core.ffprobe('-v','error','-show_streams','-of','json','-o','decode-probe.json',plan.output);core.reset();
   const checked=JSON.parse(core.FS.readFile('decode-probe.json',{encoding:'utf8'})).streams[0];
   assert.equal(checked.codec_name,'pcm_s16le');assert.equal(checked.channels,2);assert.equal(Number(checked.sample_rate),actual.sampleRate);
   core.FS.unlink('decode-probe.json');core.FS.unlink(plan.output);
  }
  core.FS.unlink('input.bin');
  console.log(`PASS own WASM decode: ${label} → PCM16 stereo 44.1 and 48 kHz`);
 }
} finally { await rm(dir,{recursive:true,force:true}); }
console.log('PASS: nine synthetic source codec/precision cases, eighteen real WASM decode/resample conversions. APE is configured but no independently generated APE fixture was available.');
