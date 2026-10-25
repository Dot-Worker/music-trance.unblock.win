import { validateApeWav, MAX_APE_WAV_BYTES } from './ape-wav.js'
let busy = false
self.onmessage = async ({ data }) => {
  if (busy) return
  busy = true
  let runtime
  try {
    let bytes = new Uint8Array(data.bytes)
    validateApeWav(bytes)
    self.postMessage({ type: 'status', message: '正在载入 APE 无损编码器…' })
    const { default: createApeEncoder } = await import(/* @vite-ignore */ data.coreURL)
    runtime = await createApeEncoder({ locateFile: () => data.wasmURL })
    runtime.FS.writeFile('/input.wav', bytes, { canOwn: true })
    bytes = null
    data.bytes = null
    self.postMessage({ type: 'status', message: '正在本地编码 APE（无损）…' })
    const status = runtime.ccall('ape_encode_wav', 'number', ['string', 'string', 'number'], ['/input.wav', '/output.ape', 2000])
    if (status !== 0) throw new Error(`APE 编码失败 (${status})`)
    runtime.FS.unlink('/input.wav')
    if (runtime.FS.stat('/output.ape').size >= MAX_APE_WAV_BYTES) throw new Error('APE 输出超过 512 MiB 安全上限。')
    const output = runtime.FS.readFile('/output.ape')
    runtime.FS.unlink('/output.ape')
    if (output.length >= MAX_APE_WAV_BYTES) throw new Error('APE 输出超过 512 MiB 安全上限。')
    if (output.length < 52 || String.fromCharCode(...output.subarray(0, 4)) !== 'MAC ') throw new Error('APE 编码器未生成有效输出。')
    self.postMessage({ type: 'done', bytes: output.buffer }, [output.buffer])
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'APE 编码失败。' })
  } finally {
    for (const file of ['/input.wav', '/output.ape']) { try { runtime?.FS.unlink(file) } catch {} }
  }
}
