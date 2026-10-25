import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeOutputName,validateAddition,LIMITS} from '../src/queue/files.js';
test('output names preserve original stem and use only the target extension',()=>{assert.equal(safeOutputName('../../CON.mp3','mp3'),'_CON.mp3');assert.equal(safeOutputName('..\\a<>:\u0001.mp3','../mp3'),'a____.mp3');assert.equal(safeOutputName('song.mp3','mp3'),'song.mp3');});
test('case insensitive collisions receive suffix',()=>{const used=new Set();assert.equal(safeOutputName('Song.ncm','wav',used),'Song.wav');assert.equal(safeOutputName('song.ncm','wav',used),'song-2.wav');});
test('empty and reserved names sanitized',()=>{assert.equal(safeOutputName('...','wav'),'audio.wav');assert.equal(safeOutputName('lpt1.foo.ncm','wav'),'_lpt1.foo.wav');});
test('size, count and batch bounds enforce before reading bytes',()=>{const f=(size,name='song')=>({name,size});assert.equal(validateAddition([],[f(0),f(LIMITS.file+1),f(LIMITS.file)]).accepted.length,1);assert.equal(validateAddition(Array(20).fill(f(1)),[f(1)]).accepted.length,0);assert.equal(validateAddition(Array(4).fill(f(LIMITS.file)),[f(1)]).accepted.length,0);});

test('Unicode, spaces and existing converted text in original stems are preserved',()=>{assert.equal(safeOutputName('夜曲 Live.ncm','flac'),'夜曲 Live.flac');assert.equal(safeOutputName('song-converted.ncm','mp3'),'song-converted.mp3');assert.equal(safeOutputName('song.mp3','mp3'),'song.mp3');});
test('collision suffix is added only when the resulting output name already exists',()=>{const used=new Set(['song.wav','song-2.wav']);assert.equal(safeOutputName('song.ncm','wav',used),'song-3.wav');assert.equal(safeOutputName('song.ncm','mp3',used),'song.mp3');});
