import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function runtimeLayout() {
 const manifestBytes=readFileSync('artifacts/core/verified-build.json');
 const manifest=JSON.parse(manifestBytes);
 const coreHash=hash(manifest.files['ffmpeg-core.js']+manifest.files['ffmpeg-core.wasm']);
 const coreDirectory=`vendor/audio-lgpl-1-${coreHash}`;
 const sourceFile=`audio-source-${manifest.files['audio-lgpl-1-corresponding-source.tar.gz']}.tar.gz`;
 const wrapperSource='node_modules/@ffmpeg/ffmpeg/dist/esm';
 const wrapperBytes=readdirSync(wrapperSource).filter(n=>n.endsWith('.js')).sort().map(n=>n+'\n'+readFileSync(`${wrapperSource}/${n}`,'utf8')).join('\n');
 const wrapperDirectory=`vendor/ffmpeg-0.12.15-${hash(wrapperBytes+coreDirectory+readFileSync('scripts/vendor.mjs','utf8'))}`;
 const apeManifestBytes=readFileSync('artifacts/ape/verified-build.json');
 const apeManifest=JSON.parse(apeManifestBytes);
 const apeDirectory=`vendor/ape-normal-1-${hash(apeManifest.files['ape.js']+apeManifest.files['ape.wasm'])}`;
 const apeSourcePath=`${apeDirectory}/ape-source-${apeManifest.files['ape-source.tar.gz']}.tar.gz`;
 const apeManifestFile=`verified-build-${hash(apeManifestBytes)}.json`;
 const engineDownloadBytes=readFileSync('artifacts/core/ffmpeg-core.js').byteLength+readFileSync('artifacts/core/ffmpeg-core.wasm').byteLength;
 return {apeDirectory,apeSourcePath,apeManifestFile,engineDownloadBytes,coreDirectory,wrapperDirectory,sourceFile,sourcePath:`${coreDirectory}/${sourceFile}`,manifestFile:`verified-build-${hash(manifestBytes)}.json`};
}
