// Synthetic, non-music 24-bit stereo PCM fixture. Streaming generation avoids giant source buffers.
import {open,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
export const activeChildren=new Set();
export async function command(bin,args){return new Promise((resolve,reject)=>{let out='',err='';const p=spawn(bin,args);activeChildren.add(p);p.on('exit',()=>activeChildren.delete(p));p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code===0?resolve(out):reject(new Error(`${bin} exited ${code}: ${err.slice(-3000)}`)));});}
export async function makeFixture(directory,pcmMiB,{kind='noise8',rate=96000}={}){
 const channels=2,bits=24,blockAlign=6;
 const pcmBytes=Math.floor(pcmMiB*1024*1024/blockAlign)*blockAlign;
 const samples=pcmBytes/blockAlign;
 const wavPath=directory+'/source.wav',flacPath=directory+'/source.flac';
 const f=await open(wavPath,'w');
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcmBytes+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*blockAlign,28);header.writeUInt16LE(blockAlign,32);header.writeUInt16LE(bits,34);header.write('data',36);header.writeUInt32LE(pcmBytes,40);
 await f.write(header);const hash=createHash('sha256');
 const chunk=Buffer.alloc(6*65536);let state=0x12345678,remaining=pcmBytes;
 while(remaining){const n=Math.min(remaining,chunk.length);for(let i=0;i<n;i+=3){state=(Math.imul(state,1664525)+1013904223)>>>0;const val=kind==='noise24'?(state>>>8):kind==='noise8'?(state>>>24)<<16:0;chunk[i]=val&255;chunk[i+1]=(val>>>8)&255;chunk[i+2]=(val>>>16)&255;}hash.update(chunk.subarray(0,n));await f.write(chunk,0,n);remaining-=n;}
 await f.close();
 await command('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',wavPath,'-map_metadata','-1','-c:a','flac','-compression_level','8',flacPath]);
 return {wavPath,flacPath,pcmBytes,samples,duration:samples/rate,rate,channels,bits,sha256:hash.digest('hex'),wavBytes:(await stat(wavPath)).size,flacBytes:(await stat(flacPath)).size,kind};
}
export async function verifyAudio(path,fixture){
 const probe=JSON.parse(await command('ffprobe',['-v','error','-show_entries','stream=codec_name,sample_rate,channels,bits_per_raw_sample,duration,duration_ts,time_base','-of','json',path]));
 const hash=(await command('ffmpeg',['-hide_banner','-loglevel','error','-i',path,'-map','0:a:0','-c:a','pcm_s24le','-f','hash','-hash','sha256','-'])).trim().replace(/^SHA256=/,'').toLowerCase();
 if(hash!==fixture.sha256)throw new Error(`Independent decoded PCM hash mismatch: ${hash} != ${fixture.sha256}`);
 const stream=probe.streams[0];if(Number(stream.sample_rate)!==fixture.rate||Number(stream.channels)!==fixture.channels)throw new Error('Independent format mismatch');
 const duration=Number(stream.duration);if(Number.isFinite(duration)&&Math.abs(duration-fixture.duration)>1/fixture.rate+.000001)throw new Error(`Duration mismatch ${duration} != ${fixture.duration}`);
 return {sha256:hash,stream,durationExpected:fixture.duration,exactPCM:true};
}
