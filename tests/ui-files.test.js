import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeOutputName,validateAddition,LIMITS} from '../src/queue/files.js';
test('output names are flat, safe and never use input name',()=>{assert.equal(safeOutputName('../../CON.mp3','mp3'),'_CON-converted.mp3');assert.equal(safeOutputName('..\\a<>:\u0001.mp3','../mp3'),'a____-converted.mp3');assert.equal(safeOutputName('song.mp3','mp3'),'song-converted.mp3');});
test('case insensitive collisions receive suffix',()=>{const used=new Set();assert.equal(safeOutputName('Song.ncm','wav',used),'Song-converted.wav');assert.equal(safeOutputName('song.ncm','wav',used),'song-converted-2.wav');});
test('empty and reserved names sanitized',()=>{assert.equal(safeOutputName('...','wav'),'audio-converted.wav');assert.equal(safeOutputName('lpt1.foo.ncm','wav'),'_lpt1.foo-converted.wav');});
test('size, count and batch bounds enforce before reading bytes',()=>{const f=(size,name='song')=>({name,size});assert.equal(validateAddition([],[f(0),f(LIMITS.file+1),f(LIMITS.file)]).accepted.length,1);assert.equal(validateAddition(Array(20).fill(f(1)),[f(1)]).accepted.length,0);assert.equal(validateAddition(Array(4).fill(f(LIMITS.file)),[f(1)]).accepted.length,0);});
