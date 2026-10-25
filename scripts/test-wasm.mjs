// Native FFmpeg generates synthetic inputs only. Every conversion under test uses our WASM core.
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createAudioEngine} from '../src/audio/index.js';
import {conversionPlan,audioInfoFromProbe} from '../src/audio/presets.js';
const require=createRequire(import.meta.url);globalThis.self={location:{href:'file:///ffmpeg-core.js'}};
const wasm=await readFile(new URL('../artifacts/core/test-core.wasm',import.meta.url));
assert.deepEqual(wasm,await readFile(new URL('../artifacts/core/ffmpeg-core.wasm',import.meta.url)));
const core=await require('../artifacts/core/ffmpeg-core.cjs')({wasmBinary:wasm});
const logs=[];core.setLogger(({message})=>logs.push(message));
const execute=args=>{logs.length=0;core.exec(...args);const code=core.ret;core.reset();assert.equal(code,0,logs.slice(-20).join('\n'));};
execute(['-L']);assert.ok(logs.join(' ').includes('GNU Lesser General Public License'));
execute(['-buildconf']);assert.ok(logs.join(' ').includes('--disable-gpl')&&logs.join(' ').includes('--disable-network'));
// Exercise an actual encoder request rather than the unused CLI listing path.
core.FS.writeFile('ape-probe.wav',await readFile(new URL('../public/demo/plain.wav',import.meta.url)));
logs.length=0;core.exec('-i','ape-probe.wav','-c:a','ape','-f','wav','ape-probe-out.wav');
assert.notEqual(core.ret,0);assert.match(logs.join(' '),/Unknown encoder ['"]?ape/i);core.reset();core.FS.unlink('ape-probe.wav');
if(core.FS.analyzePath('ape-probe-out.wav').exists)core.FS.unlink('ape-probe-out.wav');
console.log('PASS own LGPL core, network disabled; actual APE encoder request rejects as unknown.');
function probe(path){core.ffprobe('-v','error','-protocol_whitelist','file,pipe','-select_streams','a:0','-show_entries','stream=codec_type,codec_name,sample_rate,channels,sample_fmt,bits_per_raw_sample,bits_per_sample,bit_rate,channel_layout','-of','json','-o','probe.json',path);assert.equal(core.ret,0,'Actual ffprobe status');core.reset();const result=audioInfoFromProbe(JSON.parse(core.FS.readFile('probe.json',{encoding:'utf8'})));core.FS.unlink('probe.json');return result;}
let conversions=0;
function convert(bytes,preset,options={}) {
 core.FS.writeFile('input.bin',bytes);const source=probe('input.bin');
 const plan=conversionPlan(preset,options,source);execute(plan.args);
 const actual=probe(plan.output);assert.equal(actual.sampleRate,plan.expected.sampleRate);assert.equal(actual.channels,plan.expected.channels);assert.equal(actual.codec,plan.expected.codec);
 if(plan.expected.bitsPerSample)assert.equal(actual.bitsPerSample,plan.expected.bitsPerSample);
 if(preset==='mp3'){assert.equal(actual.bitRate,Number(plan.quality)*1000);assert.equal(core.FS.readFile(plan.output)[3],3);}
 const result=core.FS.readFile(plan.output);core.FS.unlink('input.bin');core.FS.unlink(plan.output);conversions++;
 return {actual,source,bytes:result};
}
const dir=await mkdtemp(join(tmpdir(),'music-synthetic-codecs-'));
async function synth(label,extension,args,channels=2){const file=join(dir,`${label}.${extension}`);const run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=96000:duration=0.2','-ac',String(channels),...args,file],{encoding:'utf8'});assert.equal(run.status,0,run.error||run.stderr);return new Uint8Array(await readFile(file));}
try {
 const pcm48=await synth('pcm48','wav',['-c:a','pcm_s16le','-ar','48000'],1);
 const pcm96=await synth('pcm96','wav',['-c:a','pcm_s24le','-ar','96000']);
 const int32=await synth('int32','wav',['-c:a','pcm_s32le','-ar','48000']);
 const float32=await synth('float32','wav',['-c:a','pcm_f32le','-ar','48000']);
 for(const bytes of [pcm48,pcm96]) for(const preset of ['wav','flac']) {
  const kept=convert(bytes,preset);assert.equal(kept.actual.sampleRate,kept.source.sampleRate);assert.equal(kept.actual.bitsPerSample,kept.source.bitsPerSample);
  for(const sampleRate of ['44100','48000'])convert(bytes,preset,{sampleRate});
 }
 for(const quality of ['16','24','32float'])convert(pcm96,'wav',{quality});
 assert.equal(convert(int32,'wav').actual.bitsPerSample,32);
 assert.equal(convert(float32,'wav').actual.isFloat,true);
 for(const quality of ['16','24'])convert(float32,'flac',{quality});
 for(const quality of ['128','192','256','320'])convert(pcm48,'mp3',{quality});
 convert(pcm48,'aac',{quality:'256'});
 for(const quality of ['320','512'])convert(pcm96,'aac',{quality,sampleRate:'48000'});
 convert(pcm96,'aac',{quality:'512'});
 assert.throws(()=>conversionPlan('mp3',{}, {sampleRate:96000,channels:2,bitsPerSample:24,isFloat:false}),/96000/);
 assert.throws(()=>conversionPlan('flac',{}, {sampleRate:48000,channels:2,bitsPerSample:32,isFloat:true}),/浮点/);
 assert.throws(()=>conversionPlan('mp3',{}, {sampleRate:48000,channels:6,bitsPerSample:24,isFloat:false}),/声道/);
 const fixtures=[['flac','flac',['-c:a','flac','-sample_fmt','s32','-ar','96000']],['mp3','mp3',['-c:a','libmp3lame','-b:a','320k','-ar','44100']],['aac','m4a',['-c:a','aac','-ar','44100']],['aac-adts','aac',['-c:a','aac','-ar','44100','-f','adts']],['vorbis','ogg',['-c:a','libvorbis','-ar','48000']],['opus','opus',['-c:a','libopus','-ar','48000']],['alac','m4a',['-c:a','alac','-ar','48000']],['wma','wma',['-c:a','wmav2','-ar','44100']]];
 for(const [label,extension,args]of fixtures){const bytes=await synth(label,extension,args);const output=convert(bytes,'wav');console.log(`PASS decode ${label}: ${output.source.sampleRate} Hz / ${output.source.channels} ch → source-rate WAV ${output.actual.bitsPerSample}${output.actual.isFloat?' float':' integer'}`);}
 const six=await synth('six-channel','wav',['-c:a','pcm_s24le','-ar','48000'],6);for(const preset of ['wav','flac'])assert.equal(convert(six,preset).actual.channels,6);
 let loadCount=0;const adapter={load:async()=>{loadCount++;},on(){},off(){},writeFile:async(p,b)=>core.FS.writeFile(p,b),readFile:async(p,encoding)=>core.FS.readFile(p,encoding?{encoding}:undefined),deleteFile:async p=>core.FS.unlink(p),terminate(){},exec:async args=>{core.exec(...args);const result=core.ret;core.reset();return result;},ffprobe:async args=>{core.ffprobe(...args);const result=core.ret;core.reset();return result;}};
 const engine=createAudioEngine({createFFmpeg:async()=>adapter,assetURL:p=>p});let reported;
 const full=await engine.convert(pcm96,{preset:'flac',onSourceInfo:info=>reported=info});
 assert.equal(full.audioInfo.sampleRate,96000);assert.equal(full.audioInfo.bitsPerSample,24);assert.equal(reported.sampleRate,96000);
 for(const file of ['input.bin','source-probe.json','output-probe.json','output.flac'])assert.equal(core.FS.analyzePath(file).exists,false,'Engine MEMFS cleanup: '+file);
 const second=await engine.convert(pcm48,{preset:'wav',onSourceInfo:info=>reported=info});
 assert.equal(second.audioInfo.sampleRate,48000);assert.equal(second.audioInfo.channels,1);assert.equal(second.audioInfo.bitsPerSample,16);assert.equal(reported.sampleRate,48000);assert.equal(reported.channels,1);assert.equal(loadCount,1,'Second file must reuse the actual loaded core');
 for(const file of ['input.bin','source-probe.json','output-probe.json','output.wav'])assert.equal(core.FS.analyzePath(file).exists,false,'Second-file engine cleanup: '+file);
 engine.dispose();conversions+=2;
 console.log(`PASS ${conversions} actual WASM conversions: source rates/precision/mono/multichannel retained, explicit rates/depths/bitrates verified. Native FFmpeg APE encoding unavailable; the separate APE SDK is covered by test:ape.`);
}finally{await rm(dir,{recursive:true,force:true});}
