import { cp, mkdir, copyFile, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runtimeLayout } from './runtime-layout.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Fail closed before copying any runtime: only this source-built core may ship.
const manifest=JSON.parse(await readFile('artifacts/core/verified-build.json','utf8'));
if(manifest.coreId!=='audio-lgpl-1' || manifest.sourceLockSHA256!==sha(await readFile('scripts/core/sources.lock.json'))) throw Error('Core source lock does not match verified build.');
const required=['ffmpeg-core.js','ffmpeg-core.wasm','ffmpeg-core.cjs','test-core.wasm','audio-lgpl-1-corresponding-source.tar.gz'];
if(!manifest.files || Object.keys(manifest.files).length!==required.length || required.some(f=>!/^([a-f0-9]{64})$/.test(manifest.files[f]||''))) throw Error('Incomplete verified core/source manifest.');
for(const file of ['scripts/core/build.sh','scripts/core/patch.py','scripts/core/fetch.py','scripts/core/package-source.py','scripts/core/sources.lock.json','scripts/core/README.md']) if(manifest.buildInputs?.[file]!==sha(await readFile(file))) throw Error(`Core recipe changed; rebuild required: ${file}`);
for(const [file,hash] of Object.entries(manifest.files)) if(sha(await readFile(`artifacts/core/${file}`))!==hash) throw Error(`Core/source integrity failure: ${file}`);
const apeManifest=JSON.parse(await readFile('artifacts/ape/verified-build.json','utf8'));
const apeFiles=['ape.js','ape.cjs','ape.wasm','ape-source.tar.gz','LICENSE.MonkeysAudio.txt',...(apeManifest.files?.['MAC_1343_SDK.zip']?['MAC_1343_SDK.zip']:[])];
if(apeManifest.files?.['MAC_1343_SDK.zip']&&apeManifest.files['MAC_1343_SDK.zip']!=='3fd1c60f994daba536902f30b1bebc2235099c8b8a039d8b37d9d27d4827e0ca')throw Error('Unexpected original SDK archive.');
if(apeManifest.coreId!=='ape-normal-1'||Object.keys(apeManifest.files||{}).length!==apeFiles.length||apeFiles.some(f=>!/^([a-f0-9]{64})$/.test(apeManifest.files[f]||'')))throw Error('Incomplete APE binary/source manifest.');
for(const file of apeFiles)if(sha(await readFile(`artifacts/ape/${file}`))!==apeManifest.files[file])throw Error(`APE integrity failure: ${file}`);
for(const file of ['README.md','build.sh','download.py','package.py','patch.py','prepare.py','test-download.py','test.mjs','wrapper.cpp']){const path=`scripts/ape/${file}`;if(apeManifest.buildInputs?.[path]!==sha(await readFile(path)))throw Error(`APE recipe changed: ${path}`);}
for(const record of [manifest,apeManifest]) {
 if(!record.sourceInputs||!Object.keys(record.sourceInputs).length)throw Error('Source archive has no application dependency manifest.');
 for(const [file,hash] of Object.entries(record.sourceInputs))if(sha(await readFile(file))!==hash)throw Error(`Packaged audio source changed; regenerate corresponding source: ${file}`);
}
await rm('public/vendor',{recursive:true,force:true});
const layout=runtimeLayout();
await mkdir(`public/${layout.apeDirectory}`,{recursive:true});
for(const file of ['ape.js','ape.wasm','LICENSE.MonkeysAudio.txt'])await copyFile(`artifacts/ape/${file}`,`public/${layout.apeDirectory}/${file}`);
await copyFile('artifacts/ape/ape-source.tar.gz',`public/${layout.apeSourcePath}`);
await copyFile('artifacts/ape/verified-build.json',`public/${layout.apeDirectory}/${layout.apeManifestFile}`);
await mkdir(`public/${layout.coreDirectory}`,{recursive:true});
for(const file of ['ffmpeg-core.js','ffmpeg-core.wasm']) await copyFile(`artifacts/core/${file}`,`public/${layout.coreDirectory}/${file}`);
await copyFile('artifacts/core/audio-lgpl-1-corresponding-source.tar.gz',`public/${layout.sourcePath}`);
await copyFile('artifacts/core/verified-build.json',`public/${layout.coreDirectory}/${layout.manifestFile}`);
const from='node_modules/@ffmpeg/ffmpeg/dist/esm',to=`public/${layout.wrapperDirectory}`;
await mkdir(to,{recursive:true});
for(const name of await readdir(from)) if(name.endsWith('.js')) await copyFile(`${from}/${name}`,`${to}/${name}`);
// Wrapper transfers Uint8Array ownership into its worker; MEMFS can retain it without another full copy.
const workerPath=`${to}/worker.js`;
const originalWorker=await readFile(workerPath,'utf8');
const writeCall='ffmpeg.FS.writeFile(path, data);';
if(originalWorker.split(writeCall).length!==2)throw Error('Unexpected FFmpeg wrapper writeFile implementation.');
await writeFile(workerPath,originalWorker.replace(writeCall,'ffmpeg.FS.writeFile(path, data, { canOwn: data instanceof Uint8Array });'));
const constants=`${to}/const.js`;
await writeFile(constants,(await readFile(constants,'utf8')).replace(/export const CORE_URL = .*;/,`export const CORE_URL = new URL("../${layout.coreDirectory.split('/').at(-1)}/ffmpeg-core.js", import.meta.url).href;`));
await mkdir('public/vendor/sql.js-1.15.1',{recursive:true});
await copyFile('node_modules/sql.js/dist/sql-wasm.wasm','public/vendor/sql.js-1.15.1/sql-wasm.wasm');
await rm('public/licenses',{recursive:true,force:true});
await cp('licenses','public/licenses',{recursive:true});
await copyFile('THIRD_PARTY_NOTICES.md','public/THIRD_PARTY_NOTICES.md');
await copyFile('THIRD_PARTY_NOTICES.md','public/THIRD_PARTY_NOTICES.txt');
await copyFile('LICENSE','public/LICENSE');
