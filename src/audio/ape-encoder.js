import { validateApeWav } from './ape-wav.js'
export { validateApeWav } from './ape-wav.js'

export function encodeApe(wavBytes, { signal, onStatus, coreURL, wasmURL } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Conversion cancelled', 'AbortError'))
  if (!coreURL || !wasmURL) return Promise.reject(new Error('APE runtime URLs are missing.'))
  try { validateApeWav(wavBytes) } catch (error) { return Promise.reject(error) }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ape-worker.js', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (error, bytes) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      error ? reject(error) : resolve(bytes)
    }
    const abort = () => finish(new DOMException('Conversion cancelled', 'AbortError'))
    signal?.addEventListener('abort', abort, { once: true })
    worker.onerror = event => finish(new Error(event.message || 'APE worker failed.'))
    worker.onmessageerror = () => finish(new Error('APE worker message could not be read.'))
    worker.onmessage = ({ data }) => {
      if (data.type === 'status') { try { onStatus?.(data.message) } catch {} }
      else if (data.type === 'done') finish(null, new Uint8Array(data.bytes))
      else if (data.type === 'error') finish(new Error(data.message))
    }
    // Own a bounded copy so cancellation does not detach the caller's source buffer.
    let bytes
    try { bytes = wavBytes instanceof Uint8Array ? wavBytes.slice() : new Uint8Array(wavBytes).slice() } catch (error) { finish(error); return }
    if (signal?.aborted) { abort(); return }
    try { worker.postMessage({ bytes: bytes.buffer, coreURL, wasmURL }, [bytes.buffer]) }
    catch (error) { finish(error) }
  })
}
