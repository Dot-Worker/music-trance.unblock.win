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
 const wrapperDirectory=`vendor/ffmpeg-0.12.15-${hash(wrapperBytes+coreDirectory)}`;
 return {coreDirectory,wrapperDirectory,sourceFile,sourcePath:`${coreDirectory}/${sourceFile}`,manifestFile:`verified-build-${hash(manifestBytes)}.json`};
}
