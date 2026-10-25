import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decryptFile,detect,sniffAudio} from '../src/decrypt/index.js';
import {qmcStatic} from '../src/decrypt/qmc.js';
const root=new URL('./fixtures/synthetic/',import.meta.url);
const read=name=>new Uint8Array(readFileSync(new URL(name,root)));
const manifest=JSON.parse(readFileSync(new URL('ape-manifest.json',root)));
for(const [name,hash] of Object.entries(manifest.files)) {
  test(`APE genuine synthetic fixture: ${name}`,async()=>{
    const data=read(name);
    assert.equal(createHash('sha256').update(data).digest('hex'),hash);
    assert.equal(sniffAudio(data),'ape');
    assert.equal(detect(data,'no-extension'),'plain');
    const result=await decryptFile(data,{name});
    assert.equal(result.extension,'ape');
    assert.equal(result.sourceFormat,'plain');
    assert.deepEqual(result.audio,data);
    // Actual decoded container determines extension, not encrypted input suffix.
    const encrypted=await decryptFile(qmcStatic(data),{name:'synthetic.qmc0'});
    assert.equal(encrypted.extension,'ape');
    assert.deepEqual(encrypted.audio,data);
  });
}
test('APE malformed descriptor/header/seek table and truncated files rejected',async()=>{
  const source=read('16-1-2000-1-silence.ape');
  for(let n=0;n<source.length;n++)assert.equal(sniffAudio(source.slice(0,n)),null,`truncated length ${n}`);
  for(const [offset,value,width] of [[4,3970,2],[4,4000,2],[8,51,4],[8,0xffffffff,4],[12,23,4],[16,3,4],[20,0xffffffff,4],[24,0xffffffff,4],[28,1,4],[32,0xffffffff,4],[52,999,2],[56,0,4],[60,0xffffffff,4],[64,0,4],[68,32,2],[70,0,2],[72,0,4],[76,0,4]]){
    const data=source.slice(),view=new DataView(data.buffer);
    width===2?view.setUint16(offset,value,true):view.setUint32(offset,value,true);
    assert.equal(sniffAudio(data),null,`invalid field ${offset}`);
    await assert.rejects(decryptFile(data,{name:'invalid.ape'}));
  }
});
