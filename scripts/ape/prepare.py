from pathlib import Path
import hashlib,json,zipfile,urllib.request,re,shutil
root=Path(__file__).resolve().parents[2];work=root/'.ape-build';archive=root/'artifacts/ape/MAC_1343_SDK.zip'
sha='3fd1c60f994daba536902f30b1bebc2235099c8b8a039d8b37d9d27d4827e0ca'
target=work/'sdk'
if target.exists():shutil.rmtree(target)
target.mkdir(parents=True)
prepared=root/'.ape-source'
if (prepared/'manifest.json').exists():
 manifest=json.loads((prepared/'manifest.json').read_text());assert manifest['sdkSha256']==sha,'Prepared source revision mismatch'
 source=prepared/'sdk';expected=manifest['files']
 assert set(str(f.relative_to(source)) for f in source.rglob('*') if f.is_file())==set(expected),'Unexpected delivered source files'
 for name,digest in expected.items():
  p=Path(name)
  if p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe prepared source path')
  assert hashlib.sha256((source/name).read_bytes()).hexdigest()==digest,'Prepared source checksum mismatch: '+name
 shutil.copytree(source,target,dirs_exist_ok=True)
else:
 if not archive.exists():
  archive.parent.mkdir(parents=True,exist_ok=True)
  with urllib.request.urlopen('https://monkeysaudio.com/files/MAC_1343_SDK.zip',timeout=120) as r:archive.write_bytes(r.read())
 assert hashlib.sha256(archive.read_bytes()).hexdigest()==sha,'SDK checksum mismatch'
 with zipfile.ZipFile(archive) as z:
  for n in z.namelist():
   pp=Path(n)
   if pp.is_absolute() or '..' in pp.parts:raise ValueError('Unsafe archive path')
  z.extractall(target)
s=(target/'CMakeLists.txt').read_text();files=[]
for group in ('MAC_SHARED_SOURCE_FILES','MAC_LIBRARY_SOURCE_FILES'):
 files+=re.findall(r'Source/[\w./]+\.cpp',s.split('set('+group+'\n',1)[1].split(')',1)[0])
files+=['Source/Shared/StdLibFileIO.cpp']
(work/'sources.txt').write_text('\n'.join(str(target/f) for f in files))
(root/'artifacts/ape').mkdir(parents=True,exist_ok=True)
shutil.copyfile(target/'License.txt',root/'artifacts/ape/LICENSE.MonkeysAudio.txt')
