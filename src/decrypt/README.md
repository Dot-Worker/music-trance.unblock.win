# Browser-local decryption core

Independent JavaScript port of the supplied WYYYYKG2Porsche `desktop/wy2p` MIT implementation (Copyright © 2026 WangZhen). Preserve root LICENSE/NOTICE when distributing. No original Python scripts or binaries are executed.

```js
import { decryptFile, detect, sniffAudio, DecryptError } from './index.js';
const result = await decryptFile(bytes, {
  name: 'song.ncm',
  // Optional KGG inputs, provided explicitly by the user:
  dbBytes, masterKeyHex, sqlWasmUrl,
});
// { audio: Uint8Array, extension: 'wav' | ..., metadata: {},
//   cover: Uint8Array, sourceFormat: 'ncm' | ... }
```

Call in a dedicated Web Worker: algorithms and SQL parsing are synchronous internally even though the top-level API is async. Cancel by terminating that worker. Do not log or persist DB/key options. Pass an absolute same-origin `sqlWasmUrl` for the pinned `sql.js-1.15.1/sql-wasm.wasm`, especially when using a bundled worker under a subpath. File limit 64 MiB; DB limit 32 MiB. The UI applies total-batch and queue limits.

Supported: NCM; KGM/KGMA/VPR; legacy KWM; QMC static, map and segmented RC4; legacy/QTag embedded ekey including EncV1 and EncV2. STag returns `NEED_QQ_EKEY`; no online key retrieval or bypass. KGG requires an explicitly supplied matching SQLite database. The legacy encrypted database implementation tries 1024/4096-byte page layouts and raw key / SHA1 PBKDF2 variants used by the original project. It validates with SQLite `quick_check` and actual schema parsing, not the synthesized header. This is **experimental legacy SQLCipher compatibility**, not universal SQLCipher support; only plaintext success and encrypted wrong-key rejection are fixture-tested.

Extensions are hints, never proof of plaintext. Decrypted container signatures and basic bounds are checked; this is not a full compressed-codec bitstream validation. Transcoding must perform its own decode validation. Unknown content fails instead of being saved under a guessed extension. AAC ADTS is recognized distinctly from MPEG audio, correcting the source sniffer's ambiguity.

All binary lengths, key/padding structures and KGM offsets are checked. SQL identifiers are quoted with escaped double quotes, lookup values bound, database read-only queries enabled; no system file scanning, filesystem output, key logging, key localStorage or external fetch is implemented here. SQL.js may fetch only its configured WASM engine. Key buffers created for database lookup are wiped after use where practical; garbage-collected JS cannot guarantee secure erasure of every temporary string or crypto-library allocation.

`node --test tests/decrypt.test.js` verifies original SHA-manifest synthetic 440 Hz fixtures and exact plaintext SHA, STag failure, offset boundaries, known-vector TEA, wrapped keys, malicious SQL identifiers, malformed headers and truncated/wrong-key databases.

## APE container input

The sniffer also recognizes modern `MAC ` APE containers (encoder versions 3980–3990), initially limited to 16/24-bit mono/stereo. It checks descriptor/header lengths, declared frame and terminating-data bounds, compression-level field, sample rate, frame counts and monotonic in-bounds seek offsets. Plain APE passes through unchanged, and encrypted payloads that decode to APE receive the actual `ape` extension. This does **not** verify codec frames or the descriptor MD5; downstream decoding remains required for conversion. Old APE headers, float `MACF`, and 32-bit profiles are not claimed supported here. Two independently generated one-frame silence fixtures have a separate `ape-manifest.json`; they do not alter the original supplied WAV-fixture manifest.
