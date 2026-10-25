#!/usr/bin/env bash
# Run on Linux with the exact toolchain from sources.lock.json. No root/private files enter artifacts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
NODE_BIN="$(command -v node)"
python3 scripts/core/fetch.py
WORK="$ROOT/.core-build"
SDK="$WORK/sources/emsdk"
"$SDK/emsdk" install 3.1.40
"$SDK/emsdk" activate 3.1.40
# Emsdk's activation environment is not packaged into source/relink artifacts.
set +u
source "$SDK/emsdk_env.sh"
set -u
export INSTALL_DIR="$WORK/install"
mkdir -p "$INSTALL_DIR" "$WORK/output/esm" "$WORK/output/umd" "$ROOT/artifacts/core"
export CFLAGS="-O3 -I$INSTALL_DIR/include"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-O3 -L$INSTALL_DIR/lib"
export EM_PKG_CONFIG_PATH="$INSTALL_DIR/lib/pkgconfig"
export PKG_CONFIG_PATH="$EM_PKG_CONFIG_PATH"
export FFMPEG_ST=1 FFMPEG_MT=
# Only LAME's LGPL library is built, not its CLI or analyzer.
cd "$WORK/sources/lame"
emconfigure ./configure --prefix="$INSTALL_DIR" --host=i686-linux --disable-shared --disable-frontend --disable-analyzer-hooks --disable-dependency-tracking --disable-gtktest
emmake make -j2
emmake make install
# Use audited FFmpeg sources, no GPL/version3/nonfree enablement and no network.
cd "$WORK/sources/ffmpeg"
emconfigure ./configure \
 --target-os=none --arch=x86_32 --enable-cross-compile --disable-asm \
 --disable-stripping --disable-programs --disable-doc --disable-debug \
 --disable-runtime-cpudetect --disable-autodetect --disable-network \
 --disable-pthreads --disable-w32threads --disable-os2threads \
 --disable-gpl --disable-version3 --disable-nonfree --disable-postproc \
 --disable-everything --enable-avcodec --enable-avformat --enable-avfilter \
 --enable-avdevice --enable-swresample --enable-swscale \
 --enable-protocol=file,pipe \
 --enable-demuxer=aac,ape,asf,flac,mov,mp3,ogg,wav \
 --enable-parser=aac,aac_latm,flac,mpegaudio,opus,vorbis \
 --enable-decoder=aac,aac_fixed,alac,ape,flac,mp3,mp3float,opus,vorbis,wmav1,wmav2,wmapro,wmalossless,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,pcm_s16be,pcm_s24be,pcm_s32be,pcm_f32be,pcm_f64be,pcm_u8 \
 --enable-encoder=aac,libmp3lame,flac,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le --enable-libmp3lame \
 --enable-muxer=ipod,mp4,mp3,wav,flac --enable-filter=abuffer,abuffersink,aformat,anull,aresample \
 --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc \
 --extra-cflags="$CFLAGS" --extra-cxxflags="$CXXFLAGS" --extra-ldflags="$LDFLAGS"
# Fail closed if configure unexpectedly enables restricted functionality.
grep -q '^#define CONFIG_GPL 0$' config.h
grep -q '^#define CONFIG_NONFREE 0$' config.h
grep -q '^#define CONFIG_NETWORK 0$' config.h
emmake make -j2
mkdir -p src
cp -R "$WORK/sources/bridge/src/bind" src/
cp -R "$WORK/sources/bridge/src/fftools" src/
# Exact documented adaptations: remove SDL port and GPL postproc library links.
python3 "$ROOT/scripts/core/patch.py" "$WORK/sources/bridge/build/ffmpeg-wasm.sh" "$WORK/link-core.sh"
bash "$WORK/link-core.sh" -lmp3lame -sEXPORT_ES6 -o "$WORK/output/esm/ffmpeg-core.js"
bash "$WORK/link-core.sh" -lmp3lame -o "$WORK/output/umd/ffmpeg-core.js"
cp "$WORK/output/esm/ffmpeg-core.js" "$WORK/output/esm/ffmpeg-core.wasm" "$ROOT/artifacts/core/"
cp "$WORK/output/umd/ffmpeg-core.js" "$ROOT/artifacts/core/ffmpeg-core.cjs"
# Both ESM and UMD use the same wasm build; retain UMD wasm separately for test correctness.
cp "$WORK/output/umd/ffmpeg-core.wasm" "$ROOT/artifacts/core/test-core.wasm"
cd "$ROOT"
"${NODE_BIN:-/usr/bin/node}" scripts/test-wasm.mjs
python3 scripts/core/package-source.py
