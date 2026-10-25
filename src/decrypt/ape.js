import {starts,u32} from './util.js';

// Modern (3.98–3.99) integer APE container identification only, based on the
// official BSD SDK's APE_DESCRIPTOR/APE_HEADER layout. This does not decode
// frames or validate the file MD5. Initial supported profile: 16/24-bit mono/stereo.
export function isApe(data) {
  if (data.length < 80 || !starts(data, 'MAC ')) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint16(4, true);
  if (version < 3980 || version > 3990) return false;
  const descriptorBytes = u32(data, 8);
  const headerBytes = u32(data, 12);
  const seekBytes = u32(data, 16);
  const originalHeaderBytes = u32(data, 20);
  const frameBytes = u32(data, 24);
  const frameBytesHigh = u32(data, 28);
  const terminatingBytes = u32(data, 32);
  if (descriptorBytes < 52 || headerBytes < 24 ||
      descriptorBytes + headerBytes > data.length || seekBytes % 4 ||
      frameBytesHigh !== 0 || frameBytes < 4) return false;
  const frameStart = descriptorBytes + headerBytes + seekBytes + originalHeaderBytes;
  const frameEnd = frameStart + frameBytes;
  if (frameEnd + terminatingBytes > data.length) return false;
  const p = descriptorBytes;
  const compression = view.getUint16(p, true);
  const blocksPerFrame = u32(data, p + 4);
  const finalBlocks = u32(data, p + 8);
  const frames = u32(data, p + 12);
  const bits = view.getUint16(p + 16, true);
  const channels = view.getUint16(p + 18, true);
  const sampleRate = u32(data, p + 20);
  if (![1000, 2000, 3000, 4000, 5000].includes(compression) ||
      !blocksPerFrame || !finalBlocks || finalBlocks > blocksPerFrame ||
      !frames || frames > Math.floor(seekBytes / 4) ||
      ![16, 24].includes(bits) || ![1, 2].includes(channels) ||
      !sampleRate || sampleRate > 768000) return false;
  let previous = -1;
  for (let i = 0; i < frames; i++) {
    const offset = u32(data, descriptorBytes + headerBytes + i * 4);
    if (offset < frameStart || offset >= frameEnd || offset <= previous) return false;
    previous = offset;
  }
  return true;
}
