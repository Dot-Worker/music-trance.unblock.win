#!/usr/bin/env python3
import pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text()
assert '-lpostproc' in source and '-sUSE_SDL=2' in source
# Nothing else is changed. Keep original upstream source archive alongside this patch recipe.
source='\n'.join(line for line in source.splitlines() if '-lpostproc' not in line and '-sUSE_SDL=2' not in line)+'\n'
pathlib.Path(sys.argv[2]).write_text(source)
# Upstream ffprobe returns a C status but forgot to store it in Module.ret.
# Preserve that real result so browser code can fail closed on probe errors.
bind=pathlib.Path('src/bind/ffmpeg/bind.js')
text=bind.read_text()
old='Module["_ffprobe"](args.length, stringsToPtr(args));'
assert text.count(old)==1, 'Unexpected upstream ffprobe binding'
bind.write_text(text.replace(old,'Module["ret"] = '+old))
