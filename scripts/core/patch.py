#!/usr/bin/env python3
import pathlib,sys
source=pathlib.Path(sys.argv[1]).read_text()
assert '-lpostproc' in source and '-sUSE_SDL=2' in source
# Nothing else is changed. Keep original upstream source archive alongside this patch recipe.
source='\n'.join(line for line in source.splitlines() if '-lpostproc' not in line and '-sUSE_SDL=2' not in line)+'\n'
pathlib.Path(sys.argv[2]).write_text(source)
