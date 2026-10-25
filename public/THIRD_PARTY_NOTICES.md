# Third-party notices and source availability

The browser application adapts Music Trance, Copyright (c) 2026 WangZhen, MIT.
The original notice is in LICENSE and licenses/original-MIT.txt. This does **not**
relicense separately distributed third-party binaries as MIT.

## JavaScript dependencies

- @ffmpeg/ffmpeg 0.12.15: MIT; https://github.com/ffmpegwasm/ffmpeg.wasm .
- crypto-js 4.2.0: MIT; https://github.com/brix/crypto-js . Used only for compatibility with legacy music encryption, not new security designs. Upstream maintenance discontinued.
- sql.js 1.15.1: MIT; https://github.com/sql-js/sql.js . Bundles SQLite (public domain), https://sqlite.org/copyright.html .
- fflate 0.8.3: MIT; https://github.com/101arrowz/fflate .
- Vite 8.3.5: MIT; build-time only, https://github.com/vitejs/vite .

Installed license texts are preserved under licenses/. package-lock.json pins
registry tarballs and integrity digests. The vendor script copies unchanged
upstream worker assets, except the worker constants' unused CDN fallback
is rewritten to the local pinned core URL. All actual load URLs are explicit,
same-origin. No remote CDN is required at runtime.

## Source-built audio core — LGPL, separate from application

The runtime core is **audio-lgpl-1**, built by this project from SHA256-pinned
FFmpeg n5.1.4, LAME3.100 and the FFmpeg.wasm bridge. It is **not** the upstream
GPL-enabled npm @ffmpeg/core binary. GPL/version3/nonfree options, networking,
SDL and external video codec libraries are disabled. FFmpeg is LGPL2.1-or-later;
LAME library is LGPL2-or-later. The ffmpeg.wasm JavaScript wrapper is MIT.
Emscripten runtime components retain their MIT/NCSA and component notices.

The complete corresponding-source/relink archive, original license notices,
exact immutable source archives, patches and reproducible build recipe are
served beside the binary at:
the visible “Audio core source” footer link (a SHA256-named archive in the same content-hashed vendor directory as the runtime).
The SHA256-named `verified-build-….json` beside the core gives digests for the generated
core and source archive. The source lock is `scripts/core/sources.lock.json`.
The build checks reported LGPL licensing and disabled GPL/network options,
then verifies all four real encoding outputs before generating that manifest.
The vendor build fails closed without the matching source/binary manifest.

Recipients may rebuild/replace the separately loaded core and debug those
modifications. No long-term source-offer obligation is promised: actual sources
and relink materials accompany the binary. Full licenses and component notices
are preserved within the source archive, with readable LGPL text under licenses/.
See scripts/core/README.md in the source archive for rebuild/relink instructions.

## Demo

public/demo/plain.wav is the original project's synthetic 440 Hz stereo fixture,
not commercial music. The source README identifies it as generated test data.
