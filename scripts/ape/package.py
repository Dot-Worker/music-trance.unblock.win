from pathlib import Path
import hashlib,json,tarfile,zipfile,io
root=Path(__file__).resolve().parents[2];out=root/'artifacts/ape'
archive=out/'ape-source.tar.gz'
with tarfile.open(archive,'w:gz') as tar:
 for f in sorted((root/'scripts/ape').rglob('*')):
  if f.is_file() and '__pycache__' not in f.parts:tar.add(f,arcname='scripts/ape/'+str(f.relative_to(root/'scripts/ape')))
 # Deliver ORIGINAL preferred source, not opaque binaries or developer project metadata.
 sourceFiles={}
 if (out/'MAC_1343_SDK.zip').exists():
  with zipfile.ZipFile(out/'MAC_1343_SDK.zip') as z:
   originals={n:z.read(n) for n in z.namelist() if not n.endswith('/')}
 else:
  preferred=root/'.ape-source/sdk'
  originals={str(p.relative_to(preferred)):p.read_bytes() for p in preferred.rglob('*') if p.is_file()}
 for n,data in sorted(originals.items()):
  p=Path(n)
  allowed=(n.startswith(('Source/','Shared/')) and p.suffix.lower() in {'.h','.cpp','.c','.asm'}) or n in {'CMakeLists.txt','License.txt','Readme.txt'}
  if not allowed:continue
  sourceFiles[n]=hashlib.sha256(data).hexdigest()
  info=tarfile.TarInfo('.ape-source/sdk/'+n);info.size=len(data);info.mode=0o644;tar.addfile(info,io.BytesIO(data))
 data=json.dumps({'sdkUrl':'https://monkeysaudio.com/files/MAC_1343_SDK.zip','sdkSha256':'3fd1c60f994daba536902f30b1bebc2235099c8b8a039d8b37d9d27d4827e0ca','files':sourceFiles},indent=2).encode()
 info=tarfile.TarInfo('.ape-source/manifest.json');info.size=len(data);info.mode=0o644;tar.addfile(info,io.BytesIO(data))
 for n in ['src/audio/limits.js','src/audio/ape-encoder.js','src/audio/ape-worker.js','src/audio/ape-wav.js','scripts/core/fetch.py','scripts/core/sources.lock.json']:
  tar.add(root/n,arcname=n)
files={n:{'sha256':hashlib.sha256((out/n).read_bytes()).hexdigest(),'bytes':(out/n).stat().st_size} for n in ['ape.js','ape.cjs','ape.wasm','ape-source.tar.gz','MAC_1343_SDK.zip','LICENSE.MonkeysAudio.txt'] if (out/n).exists()}
(out/'manifest.json').write_text(json.dumps({'name':'Monkey\'s Audio','version':'13.43','toolchain':'Emscripten 3.1.40','license':'BSD-3-Clause','sdkUrl':'https://monkeysaudio.com/files/MAC_1343_SDK.zip','sdkSha256':'3fd1c60f994daba536902f30b1bebc2235099c8b8a039d8b37d9d27d4827e0ca','compression':2000,'pcmBits':[16,24],'channels':[1,2],'pthreads':False,'files':files},indent=2)+'\n')
inputs={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'scripts/ape').rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
(root/'artifacts/ape/verified-build.json').write_text(json.dumps({'coreId':'ape-normal-1','files':{n:v['sha256'] for n,v in files.items()},'buildInputs':inputs,'sourceInputs':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'src/audio/limits.js',*sorted((root/'src/audio').glob('ape-*.js'))]}},indent=2)+'\n')
