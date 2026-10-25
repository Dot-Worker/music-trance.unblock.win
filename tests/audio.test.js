import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { conversionPlan, outputName } from '../src/audio/presets.js';
import { sniffAudio, parseWav } from '../src/audio/probe.js';
import { createAudioEngine } from '../src/audio/index.js';
test('suggested profiles always re-encode actual audio; no extension remux shortcut',()=>{
 for(const id of ['aac-2010','wav-44100','wav-48000','mp3-compact']) {const p=conversionPlan(id);assert.ok(p.args.includes('-c:a'));assert.ok(!p.args.includes('copy'));assert.ok(p.args.includes('0:a:0'));}
 assert.ok(conversionPlan('aac-2010').args.includes('aac_low'));
 assert.ok(conversionPlan('mp3-compact').args.includes('-id3v2_version'));
 assert.throws(()=>conversionPlan('unknown'));
});
test('header probes and bounded WAV parser',async()=>{
 const b=new Uint8Array(await readFile(new URL('../public/demo/plain.wav',import.meta.url)));
 assert.equal(sniffAudio(b),'wav');assert.equal(parseWav(b).bitsPerSample,16);
 assert.throws(()=>parseWav(b.subarray(0,30)),/Truncated/);
 assert.equal(sniffAudio(new Uint8Array([1,2,3])),null);
 assert.equal(outputName('../song?.flac','wav'),'.._song_.wav');
});
function fakeEngine(){const events=[];const instance={load:async c=>events.push(['load',c]),on:()=>{},off:()=>{},writeFile:async()=>{},exec:async()=>0,readFile:async()=>new Uint8Array([1,2]),deleteFile:async p=>events.push(['delete',p]),terminate:()=>events.push(['terminate'])};return{events,instance};}
test('lazy local worker assets and successful MEMFS cleanup',async()=>{
 const {events,instance}=fakeEngine(); const e=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>`https://example.org/repo/${p}`});
 assert.equal(events.length,0);
 const r=await e.convert(new Uint8Array([1]),{preset:'wav-44100',name:'x.flac'});
 assert.equal(r.name,'x.wav');assert.deepEqual(events.filter(x=>x[0]==='delete').map(x=>x[1]),['input.bin','output.wav']);
 assert.match(events[0][1].classWorkerURL,/\/repo\/vendor\/ffmpeg-0.12.15-test\/worker.js$/);e.dispose();
});
test('conversion failure terminates worker and rejects clearly',async()=>{
 const {events,instance}=fakeEngine();instance.exec=async()=>1;
 const e=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>p});
 await assert.rejects(e.convert(new Uint8Array([1]),{preset:'mp3-compact'}),/Local conversion failed/);assert.ok(events.some(x=>x[0]==='terminate'));
});
test('abort before start never downloads engine',async()=>{
 const e=createAudioEngine({createFFmpeg:async()=>{throw Error('should not load')}});const c=new AbortController();c.abort();
 await assert.rejects(e.convert(new Uint8Array([1]),{preset:'wav-44100',signal:c.signal}),{name:'AbortError'});
});
test('explicit cancel during lazy module import prevents engine loading',async()=>{
 const {events,instance}=fakeEngine();let resolve;
 const e=createAudioEngine({createFFmpeg:()=>new Promise(r=>resolve=r),assetURL:p=>p});
 const work=e.convert(new Uint8Array([1]),{preset:'wav-44100'});e.cancel();resolve(instance);
 await assert.rejects(work,{name:'AbortError'});assert.ok(!events.some(x=>x[0]==='load'));
});
test('near-cap output is rejected rather than exporting truncated audio',async()=>{
 const {instance}=fakeEngine();instance.readFile=async()=>({byteLength:134217728});
 const e=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>p});
 await assert.rejects(e.convert(new Uint8Array([1]),{preset:'wav-44100'}),/No truncated output was exported/);
});
test('failed MEMFS cleanup destroys worker',async()=>{
 const {instance,events}=fakeEngine();instance.deleteFile=async()=>{throw Error('cleanup failure');};
 const e=createAudioEngine({createFFmpeg:async()=>instance,assetURL:p=>p});
 await e.convert(new Uint8Array([1]),{preset:'mp3-compact'});
 assert.ok(events.some(x=>x[0]==='terminate'));
});
