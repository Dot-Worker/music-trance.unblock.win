# Source-built single-thread audio core

This core is built from the immutable SHA256-verified sources in `sources.lock.json`.
No npm FFmpeg core binary is included. FFmpeg is configured LGPL 2.1-or-later,
without GPL, version3, nonfree, network or external video libraries. The only
external codec library is LAME (LGPL). The upstream CLI/JS bridge is pinned;
`patch.py` removes unused SDL/postproc link flags and fixes the upstream JavaScript ffprobe binding to preserve its real C return status. All modifications are
visible in `build.sh` and `patch.py`; original FFmpeg/LAME/SDK archives are included unchanged. For the bridge, only required src/bind, src/fftools, build and LICENSE files are included, byte-for-byte, with revision and per-file hashes (unrelated example apps and their .npmrc are excluded).

## Rebuild

On Linux with Python3, Node24, make, autoconf/automake/libtool, native FFmpeg (synthetic fixture generation only), and a C toolchain:

```
bash scripts/core/build.sh
```

The script fetches only pinned archives, verifies hashes, installs/activates the
pinned official Emscripten3.1.40 SDK, builds LAME/FFmpeg and bridge, runs a real WASM encoding/probe matrix covering generic formats, bitrates, source rates/precision, explicit resampling, and mono/multichannel preservation and checks LGPL / disabled GPL and network, then creates
`artifacts/core/`. The source archive contains the exact input source archives,
these build/patch scripts, linked Emscripten runtime source, license notices and
linkable FFmpeg/LAME libraries/objects plus generated configuration. The compiler
itself is a general-purpose build tool installed through the pinned SDK manifest.
It is not part of the application's separately licensed audio core.

To rebuild from the delivered source archive, unpack it into a clean directory;
`fetch.py` reuses included `.core-build/archives` after verifying their hashes.
A minimal `package.json` containing `{"type":"module"}` is included for the
Node smoke test; no npm dependencies are needed by the core build/test itself.
The installed SDK needs network access on first installation. To relink modified
FFmpeg/LAME, replace/rebuild libraries and use the included patched `link-core.sh`
with the configuration, source tree and SDK produced by `build.sh` (the build
script records the exact link invocation and flags). Runtime JS/WASM are separate,
replaceable same-origin files; the application does not prohibit debugging or
replacement of the LGPL component. No long-term written source offer is made:
actual corresponding sources/materials are delivered alongside each binary.

`verified-build.json` cryptographically binds the core JS/WASM, source/relink
archive and source lock. The application vendor script verifies it and fails
closed if absent/mismatched. Never copy an old npm/GPL core into these paths.

For intentional modifications to the delivered bridge source, update its per-file hashes in `.core-build/prepared-bridge.json` before rebuilding. This is a consistency check, not a restriction on modification.
