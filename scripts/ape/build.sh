#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
SDK="$ROOT/.core-build/sources/emsdk"
if [[ ! -f "$SDK/upstream/emscripten/em++" ]]; then
 python3 scripts/core/fetch.py
 "$SDK/emsdk" install 3.1.40
 "$SDK/emsdk" activate 3.1.40
fi
set +u
source "$SDK/emsdk_env.sh" >/dev/null
set -u
WORK="$ROOT/.ape-build"
mkdir -p "$WORK" "$ROOT/artifacts/ape"
python3 scripts/ape/prepare.py
python3 scripts/ape/patch.py "$WORK/sdk"
mapfile -t SOURCES < "$WORK/sources.txt"
COMMON=(-O2 -fwrapv -std=c++11 -DPLATFORM_LINUX -I"$WORK/sdk/Source/Shared" -I"$WORK/sdk/Source/MACLib" scripts/ape/wrapper.cpp "${SOURCES[@]}" -sMODULARIZE=1 -sEXPORT_NAME=createApeEncoder -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=1073741824 -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=ccall,FS -sEXPORTED_FUNCTIONS=_ape_encode_wav -sDISABLE_EXCEPTION_CATCHING=0)
em++ "${COMMON[@]}" -sEXPORT_ES6=1 -o artifacts/ape/ape.js
em++ "${COMMON[@]}" -o "$WORK/ape.cjs"
cp "$WORK/ape.cjs" artifacts/ape/ape.cjs
# Both links must have exactly the same WASM; never test a different binary silently.
cmp artifacts/ape/ape.wasm "$WORK/ape.wasm"
python3 scripts/ape/package.py
