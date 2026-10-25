import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {conversionPlan,outputName,audioInfoFromProbe} from '../src/audio/presets.js';
import {sniffAudio,parseWav} from '../src/audio/probe.js';
import {createAudioEngine} from '../src/audio/index.js';
const info={sampleRate:48000,channels:1,bitsPerSample:24,isFloat:false};
test('generic plans preserve actual source rate and mono, always encode',()=>{
 for(const id of ['mp3','wav','flac','aac']) {const p=conversionPlan(id,id==='aac'?{quality:'256'}:{},info);assert.ok(p.args.includes('-c:a'));assert.ok(!p.args.includes('copy'));assert.equal(p.expected.sampleRate,48000);assert.equal(p.expected.channels,1);}
 assert.equal(conversionPlan('ape',{},info).expected.codec,'ape');assert.throws(()=>conversionPlan('ape',{}, {...info,channels:6}),/APE/);assert.throws(()=>conversionPlan('wav'),/音源/);
});
test('source 96k lossless preserved; incompatible MP3 rejects rather than resamples',()=>{
 const source={...info,sampleRate:96000};
 for(const id of ['wav','flac']) assert.equal(conversionPlan(id,{},source).expected.sampleRate,96000);
 assert.throws(()=>conversionPlan('mp3',{},source),/96000/);
 assert.equal(conversionPlan('mp3',{sampleRate:'44100'},source).expected.sampleRate,44100);
 assert.throws(()=>conversionPlan('mp3',{}, {...info,channels:6}),/声道/);
});
test('precision policy never silently quantizes float or >24bit source into FLAC',()=>{
 assert.equal(conversionPlan('wav',{},info).expected.codec,'pcm_s24le');
 assert.equal(conversionPlan('wav',{}, {...info,bitsPerSample:32}).expected.codec,'pcm_s32le');
 assert.equal(conversionPlan('wav',{}, {...info,bitsPerSample:32,isFloat:true}).expected.codec,'pcm_f32le');
 assert.throws(()=>conversionPlan('flac',{}, {...info,bitsPerSample:32,isFloat:true}),/浮点/);
 assert.throws(()=>conversionPlan('flac',{}, {...info,bitsPerSample:32}),/24/);
 assert.equal(conversionPlan('flac',{quality:'24'}, {...info,bitsPerSample:32,isFloat:true}).expected.bitsPerSample,24);
});
test('probe uses actual fields and decoded float precision',()=>{
 assert.deepEqual(audioInfoFromProbe({streams:[{codec_type:'audio',codec_name:'aac',sample_rate:'96000',channels:1,sample_fmt:'fltp'}]}),{codec:'aac',sampleRate:96000,channels:1,bitsPerSample:32,sampleFormat:'fltp',isFloat:true,bitRate:null,channelLayout:null,duration:null});
 assert.throws(()=>audioInfoFromProbe({streams:[]}));
});
test('header probe and bounded parser',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('../public/demo/plain.wav',import.meta.url)));assert.equal(sniffAudio(bytes),'wav');assert.equal(parseWav(bytes).bitsPerSample,16);assert.throws(()=>parseWav(bytes.subarray(0,30)),/Truncated/);assert.equal(outputName('../song?.flac','wav'),'.._song_.wav');
});
function fakeEngine(){
 const events=[];let args=[];
 const source={codec_type:'audio',codec_name:'pcm_s16le',sample_rate:'48000',channels:1,sample_fmt:'s16',bits_per_sample:16};
 const instance={load:async c=>events.push(['load',c]),on(){},off(){},writeFile:async()=>{},ffprobe:async()=>0,exec:async a=>{args=a;return 0;},readFile:async p=>{
  if(p==='source-probe.json') return JSON.stringify({streams:[source]});
  if(p==='output-probe.json'){const c=args[args.indexOf('-c:a')+1];return JSON.stringify({streams:[{...source,codec_name:c==='libmp3lame'?'mp3':c,sample_rate:args[args.indexOf('-ar')+1],channels:Number(args[args.indexOf('-ac')+1]),bit_rate:'320000'}]});}
  return new Uint8Array([1,2]);
 },deleteFile:async p=>events.push(['delete',p]),terminate:()=>events.push(['terminate'])};return {events,instance};
}
test('lazy engine probes, reports source, cleans every MEMFS file',async()=>{
 const {events,instance}=fakeEngine();const e=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>`https://example.org/repo/${p}`});let source;
 assert.equal(events.length,0);const out=await e.convert(new Uint8Array([1]),{preset:'wav',onSourceInfo:i=>source=i});assert.equal(out.audioInfo.sampleRate,48000);assert.equal(source.channels,1);
 assert.deepEqual(events.filter(x=>x[0]==='delete').map(x=>x[1]),['input.bin','source-probe.json','output-probe.json','output.wav']);e.dispose();
});
test('codec failure terminates worker',async()=>{
 const {events,instance}=fakeEngine();instance.exec=async()=>1;const e=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>p});await assert.rejects(e.convert(new Uint8Array([1]),{preset:'wav'}),/Local conversion failed/);assert.ok(events.some(x=>x[0]==='terminate'));
});
test('preaborted and lazy-import cancel never load core',async()=>{
 const controller=new AbortController();controller.abort();const e=createAudioEngine();await assert.rejects(e.convert(new Uint8Array([1]),{preset:'wav',signal:controller.signal}),{name:'AbortError'});
 const {events,instance}=fakeEngine();let resolve;const engine=createAudioEngine({createFFmpeg:()=>new Promise(r=>resolve=r),assetURL:p=>p});const work=engine.convert(new Uint8Array([1]),{preset:'wav'});engine.cancel();resolve(instance);await assert.rejects(work,{name:'AbortError'});assert.ok(!events.some(x=>x[0]==='load'));
});

test('AAC rejects bitrate beyond LC per-channel frame limit, never silently clamps',()=>{assert.throws(()=>conversionPlan('aac',{quality:'512'},info),/编码上限/);assert.equal(conversionPlan('aac',{quality:'512'}, {...info,channels:2}).quality,'512');});

test('desktop PCM budgets reject estimated expansion and honor remaining result budget',()=>{
 const source={...info,duration:1000,sampleRate:96000,channels:2,bitsPerSample:24,isFloat:false};
 assert.throws(()=>conversionPlan('wav',{quality:'32float'},source),/预计 PCM/);
 assert.throws(()=>conversionPlan('ape',{},source),/预计 PCM/);
 const small={...source,duration:1};
 const plan=conversionPlan('wav',{maxOutputBytes:1024*1024},small);
 assert.equal(plan.args[plan.args.indexOf('-fs')+1],'1048576');
 assert.throws(()=>conversionPlan('wav',{maxOutputBytes:128*1024},small),/预计 PCM/);
 assert.throws(()=>conversionPlan('wav',{maxOutputBytes:0},small),/可用输出空间/);
 assert.equal(audioInfoFromProbe({streams:[{codec_type:'audio',codec_name:'pcm_s16le',sample_rate:'48000',channels:2,duration:'2.5'}]}).duration,2.5);
 assert.equal(audioInfoFromProbe({streams:[{codec_type:'audio',sample_rate:'48000',channels:2}],format:{duration:'3.75'}}).duration,3.75);
});

test('remaining output budget rejects near-cap output rather than exporting truncation',async()=>{
 const {instance,events}=fakeEngine();const read=instance.readFile;
 instance.readFile=async p=>p.endsWith('.json')?read(p):new Uint8Array(200*1024);
 const engine=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>p});
 await assert.rejects(engine.convert(new Uint8Array([1]),{preset:'wav',maxOutputBytes:256*1024}),/available result budget/);
 assert.ok(events.some(([event])=>event==='terminate'));
});
