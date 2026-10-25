#!/usr/bin/env python3
"""Fetch only immutable allowlisted source archives, verify SHA256, safely unpack."""
import hashlib,json,pathlib,tarfile,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
lock=json.loads((ROOT/'scripts/core/sources.lock.json').read_text())
work=ROOT/'.core-build'; archives=work/'archives'; sources=work/'sources'
archives.mkdir(parents=True,exist_ok=True);sources.mkdir(parents=True,exist_ok=True)
for item in lock['sources']:
    prepared=work/('prepared-'+item['name']+'.json')
    if prepared.exists():
        manifest=json.loads(prepared.read_text())
        if manifest['revision']!=item['revision']: raise SystemExit('Prepared source revision mismatch')
        for name,digest in manifest['files'].items():
            if '..' in pathlib.PurePosixPath(name).parts or name.startswith('/'): raise SystemExit('Unsafe prepared source path')
            if hashlib.sha256((sources/item['name']/name).read_bytes()).hexdigest()!=digest: raise SystemExit('Prepared source checksum mismatch: '+name)
        print('Verified delivered source tree:',item['name'],flush=True)
        continue
    destination=archives/(item['name']+'.tar.gz')
    if not destination.exists():
        with urllib.request.urlopen(item['url'],timeout=180) as response: destination.write_bytes(response.read())
    if hashlib.sha256(destination.read_bytes()).hexdigest()!=item['sha256']: raise SystemExit('Source checksum mismatch: '+item['name'])
    target=sources/item['name'];target.mkdir(exist_ok=True)
    if any(target.iterdir()): continue
    with tarfile.open(destination) as archive:
        for member in archive.getmembers():
            parts=pathlib.PurePosixPath(member.name).parts
            if len(parts)<2: continue
            member.name=str(pathlib.PurePosixPath(*parts[1:]))
            if '..' in pathlib.PurePosixPath(member.name).parts or member.name.startswith('/'): raise SystemExit('Unsafe archive path')
            archive.extract(member,target,filter='data')
    print('Verified source:',item['name'],item['revision'],flush=True)
