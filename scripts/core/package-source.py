#!/usr/bin/env python3
"""Package explicit source/license/relink allowlists. Never archive a workspace or home."""
import hashlib,json,pathlib,tarfile,io
ROOT=pathlib.Path(__file__).resolve().parents[2]; WORK=ROOT/'.core-build'; OUT=ROOT/'artifacts/core'
lock=json.loads((ROOT/'scripts/core/sources.lock.json').read_text())
archive=OUT/'audio-lgpl-1-corresponding-source.tar.gz'
def safe_add(tar,path,name):
    path=pathlib.Path(path)
    if not path.is_file() or path.is_symlink(): raise RuntimeError('Expected regular source/material file: '+str(path))
    tar.add(path,arcname=name,recursive=False)
with tarfile.open(archive,'w:gz') as tar:
    data=b'{"type":"module"}\n';entry=tarfile.TarInfo('package.json');entry.size=len(data);tar.addfile(entry,io.BytesIO(data))
    for item in lock['sources']:
        if item['name']!='bridge':
            safe_add(tar,WORK/'archives'/(item['name']+'.tar.gz'),'.core-build/archives/'+item['name']+'.tar.gz')
            continue
        # Bridge's unrelated example apps contain .npmrc: package required preferred sources only.
        base=WORK/'sources/bridge'; selected=[]
        for folder in ['src/bind','src/fftools','build']:
            selected.extend(p for p in (base/folder).rglob('*') if p.is_file() and not p.is_symlink())
        selected.append(base/'LICENSE')
        manifest={'revision':item['revision'],'files':{}}
        for path in selected:
            relative=str(path.relative_to(base));manifest['files'][relative]=hashlib.sha256(path.read_bytes()).hexdigest()
            safe_add(tar,path,'.core-build/sources/bridge/'+relative)
        data=(json.dumps(manifest,indent=2)+'\n').encode();entry=tarfile.TarInfo('.core-build/prepared-bridge.json');entry.size=len(data);tar.addfile(entry,io.BytesIO(data))
    for path in (ROOT/'scripts/core').iterdir():
        if path.suffix in ('.py','.sh','.json','.md'): safe_add(tar,path,'scripts/core/'+path.name)
    for relative in ['LICENSE','scripts/test-wasm.mjs','public/demo/plain.wav']:
        safe_add(tar,ROOT/relative,relative)
    # Ship the complete own audio-module graph, including lazy worker helpers.
    for path in sorted((ROOT/'src/audio').glob('*.js')):
        safe_add(tar,path,'src/audio/'+path.name)
    safe_add(tar,WORK/'link-core.sh','relink/link-core.sh')
    # Linkable libraries/objects and generated configuration support rebuilding/relinking a modified library.
    source=WORK/'sources/ffmpeg'
    for directory in ['libavcodec','libavformat','libavfilter','libavdevice','libavutil','libswscale','libswresample']:
        for path in (source/directory).rglob('*'):
            if path.is_file() and path.suffix in ('.a','.o'): safe_add(tar,path,'relink/ffmpeg/'+str(path.relative_to(source)))
    for relative in ['config.h','config_components.h','ffbuild/config.mak','ffbuild/config.sh']:
        if (source/relative).exists(): safe_add(tar,source/relative,'relink/ffmpeg/'+relative)
    for path in (WORK/'install/lib').glob('*.a'): safe_add(tar,path,'relink/lame/'+path.name)
    # Actual linked Emscripten C/C++/JS runtime sources + license from pinned SDK installation.
    ems=WORK/'sources/emsdk/upstream/emscripten'
    for relative in ['system/lib','system/include','src']:
        for path in (ems/relative).rglob('*'):
            if path.is_file() and not path.is_symlink() and '.git' not in path.parts:
                safe_add(tar,path,'runtime-source/emscripten/'+str(path.relative_to(ems)))
    safe_add(tar,ems/'LICENSE','runtime-source/emscripten/LICENSE')
    for project in ['ffmpeg','lame','bridge']:
        for path in (WORK/'sources'/project).iterdir():
            if path.is_file() and (path.name.startswith(('COPYING','LICENSE','AUTHORS'))): safe_add(tar,path,'licenses/'+project+'/'+path.name)
# Version/copyright/configuration checks and four actual conversions must have passed before this marker exists.
files=['ffmpeg-core.js','ffmpeg-core.wasm','ffmpeg-core.cjs','test-core.wasm',archive.name]
manifest={'coreId':lock['coreId'],'sourceLockSHA256':hashlib.sha256((ROOT/'scripts/core/sources.lock.json').read_bytes()).hexdigest(),'files':{name:hashlib.sha256((OUT/name).read_bytes()).hexdigest() for name in files}}
manifest['buildInputs']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'scripts/core').iterdir()) if p.suffix in ('.py','.sh','.json','.md')}
(OUT/'verified-build.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Complete corresponding-source/relink archive:',archive.stat().st_size,'bytes')
