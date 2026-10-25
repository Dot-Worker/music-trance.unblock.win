import test from 'node:test';
import assert from 'node:assert/strict';
import {decryptFile} from '../src/decrypt/index.js';
import {MAX_INPUT_BYTES,MAX_DB_BYTES} from '../src/audio/limits.js';

// Sparse zero-filled memory, no private audio and no codec execution. This
// verifies admission boundaries and zero-copy ownership, not 256 MiB encoding.
test('shared desktop input boundary and plaintext zero-copy ownership',async()=>{
  assert.equal(MAX_INPUT_BYTES,256*1024*1024);
  const storage=new Uint8Array(MAX_INPUT_BYTES+1);
  await assert.rejects(decryptFile(storage,{name:'too-large.wav'}),{code:'FILE_TOO_LARGE'});
  const audio=storage.subarray(0,MAX_INPUT_BYTES);
  const view=new DataView(audio.buffer,audio.byteOffset,audio.byteLength);
  const text=(offset,s)=>audio.set(new TextEncoder().encode(s),offset);
  text(0,'RIFF');view.setUint32(4,audio.length-8,true);text(8,'WAVE');
  text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,1,true);view.setUint32(24,44100,true);
  view.setUint32(28,88200,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,audio.length-44,true);
  const result=await decryptFile(audio,{name:'synthetic-large.wav'});
  assert.equal(result.extension,'wav');assert.equal(result.sourceFormat,'plain');
  assert.equal(result.audio,audio);assert.equal(result.audio.buffer,storage.buffer);
  assert.equal(view.getUint32(40,true),audio.length-44);
  // One-byte-below boundary is admitted, but a truncated container still fails.
  await assert.rejects(decryptFile(audio.subarray(0,MAX_INPUT_BYTES-1),{name:'truncated.wav'}),{code:'UNSUPPORTED_FORMAT'});
});

test('DB boundary remains 32 MiB and rejects before parsing oversized input',async()=>{
  assert.equal(MAX_DB_BYTES,32*1024*1024);
  const storage=new Uint8Array(MAX_DB_BYTES+1);
  await assert.rejects(decryptFile(new Uint8Array(12),{name:'bad.kgg',dbBytes:storage}),{code:'DB_TOO_LARGE'});
  // At the boundary a non-KGG unsupported input follows its normal format path.
  await assert.rejects(decryptFile(new Uint8Array(12),{name:'bad.bin',dbBytes:storage.subarray(0,MAX_DB_BYTES)}),{code:'UNSUPPORTED_FORMAT'});
});
