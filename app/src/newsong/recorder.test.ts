import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECORDING_SEC,
  RecorderError,
  createRecorder,
  extensionFor,
  pickMimeType,
  rms,
  type MediaRecorderLike,
  type RecorderDeps,
} from './recorder'

function fakes(overrides: Partial<RecorderDeps> = {}) {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  let push: (chunk: Blob) => void = () => {}
  const media: MediaRecorderLike = {
    mimeType: 'audio/webm;codecs=opus',
    start: vi.fn((_timesliceMs: number, onData: (chunk: Blob) => void) => {
      push = onData
    }),
    stop: vi.fn(async () => push(new Blob(['tail']))),
  }
  const meter = { level: () => 0.25, close: vi.fn() }
  let clock = 1_000_000
  const deps: RecorderDeps = {
    isSecureContext: true,
    getUserMedia: vi.fn(async () => stream),
    createMediaRecorder: vi.fn(() => media),
    isTypeSupported: (t) => t === 'audio/webm;codecs=opus',
    createLevelMeter: () => meter,
    now: () => clock,
    ...overrides,
  }
  return {
    deps,
    track,
    media,
    meter,
    push: (chunk: Blob) => push(chunk),
    advance: (ms: number) => {
      clock += ms
    },
  }
}

afterEach(() => vi.useRealTimers())

describe('createRecorder', () => {
  it('records, times, meters and returns the audio with a matching file name', async () => {
    const f = fakes()
    const rec = createRecorder(f.deps)
    await rec.start()
    expect(f.deps.createMediaRecorder).toHaveBeenCalledWith(expect.anything(), 'audio/webm;codecs=opus')
    f.push(new Blob(['abc']))
    f.advance(27_000)
    expect(rec.elapsedSec()).toBe(27)
    expect(rec.level()).toBe(0.25)

    const out = await rec.stop()
    expect(out.filename).toBe('recording.webm')
    expect(out.mimeType).toBe('audio/webm;codecs=opus')
    expect(out.durationSec).toBe(27)
    expect(out.startedAt.getTime()).toBe(1_000_000)
    expect(out.blob.size).toBe('abc'.length + 'tail'.length)
    expect(f.track.stop).toHaveBeenCalled()
    expect(f.meter.close).toHaveBeenCalled()
  })

  it('maps an insecure origin, missing APIs, a blocked or missing mic to codes', async () => {
    const codeOf = (deps: RecorderDeps) =>
      createRecorder(deps).start().then(
        () => 'ok',
        (e: unknown) => (e instanceof RecorderError ? e.code : 'other'),
      )
    expect(await codeOf(fakes({ isSecureContext: false }).deps)).toBe('insecure')
    expect(await codeOf(fakes({ getUserMedia: null }).deps)).toBe('unsupported')
    expect(await codeOf(fakes({ createMediaRecorder: null }).deps)).toBe('unsupported')
    expect(await codeOf(fakes({ getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError') } }).deps)).toBe('denied')
    expect(await codeOf(fakes({ getUserMedia: async () => { throw new DOMException('no', 'NotFoundError') } }).deps)).toBe('no_mic')
  })

  it('stops by itself at 8:00', async () => {
    vi.useFakeTimers()
    const f = fakes()
    const onAutoStop = vi.fn()
    const rec = createRecorder(f.deps, { onAutoStop })
    await rec.start()
    f.advance(MAX_RECORDING_SEC * 1000)
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_SEC * 1000)
    expect(onAutoStop).toHaveBeenCalledWith(expect.objectContaining({ durationSec: 480 }))
    expect(f.track.stop).toHaveBeenCalled()
  })

  it('cancel releases the microphone without a result', async () => {
    const f = fakes()
    const rec = createRecorder(f.deps)
    await rec.start()
    rec.cancel()
    expect(f.media.stop).toHaveBeenCalled()
    expect(f.track.stop).toHaveBeenCalled()
    await expect(rec.stop()).rejects.toThrow('not recording')
  })
})

describe('helpers', () => {
  it('picks the first container the browser supports', () => {
    expect(pickMimeType((t) => t.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2')
    expect(pickMimeType(() => false)).toBeUndefined()
  })

  it('names files after the container', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('.webm')
    expect(extensionFor('audio/mp4')).toBe('.m4a')
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('.ogg')
    expect(extensionFor('audio/x-unknown')).toBe('.bin')
  })

  it('measures loudness as RMS of the centred samples', () => {
    expect(rms(new Uint8Array([128, 128]))).toBe(0)
    expect(rms(new Uint8Array([0, 255]))).toBeCloseTo(0.996, 2)
    expect(rms(new Uint8Array([]))).toBe(0)
  })
})
