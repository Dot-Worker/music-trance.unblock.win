// Gate the independently verified APE subset before calling the C++ WAV parser.
import { MAX_OUTPUT_BYTES } from './limits.js'
export const MAX_APE_WAV_BYTES = MAX_OUTPUT_BYTES
export function validateApeWav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_APE_WAV_BYTES) throw new Error('APE WAV size must be between 44 bytes and 512 MiB.')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = p => String.fromCharCode(...bytes.subarray(p, p + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('APE requires a finalized RIFF WAV input.')
  const end = v.getUint32(4, true) + 8
  if (end > bytes.length || end < 44) throw new Error('Invalid WAV container length.')
  let format, dataBytes = 0, dataChunks = 0, dataOffset = 0
  for (let p = 12; p + 8 <= end;) {
    const size = v.getUint32(p + 4, true), start = p + 8
    if (size > end - start) throw new Error('Truncated WAV chunk.')
    if (tag(p) === 'fmt ') {
      if (format || size < 16) throw new Error('Invalid WAV format chunk.')
      const code = v.getUint16(start, true), channels = v.getUint16(start + 2, true)
      const sampleRate = v.getUint32(start + 4, true), bits = v.getUint16(start + 14, true)
      const blockAlign = v.getUint16(start + 12, true)
      if (![1, 2].includes(channels) || ![16, 24].includes(bits)) throw new Error('APE supports only 16/24-bit integer mono or stereo PCM.')
      if (sampleRate < 8000 || sampleRate > 384000 || blockAlign !== channels * bits / 8) throw new Error('Unsupported WAV sample format.')
      if (code === 0xfffe) {
        const guid = [1,0,0,0,0,0,16,0,128,0,0,170,0,56,155,113]
        if (size < 40 || v.getUint16(start + 16, true) < 22 || v.getUint16(start + 18, true) !== bits || !guid.every((x,i) => bytes[start + 24 + i] === x)) throw new Error('APE requires integer PCM WAV extensible format.')
      } else if (code !== 1) throw new Error('APE requires integer PCM, not floating-point WAV.')
      format = {channels, sampleRate, bits, blockAlign}
    } else if (tag(p) === 'data') { dataChunks++; dataBytes = size; dataOffset = start }
    p = start + size + (size & 1)
  }
  if (!format || dataChunks !== 1 || !dataBytes || dataBytes % format.blockAlign) throw new Error('Invalid or empty WAV PCM data.')
  return {...format, dataBytes, dataOffset, samples: dataBytes / format.blockAlign}
}
