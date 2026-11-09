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
  const track: { stop: () => void; onended?: ((ev: Event) => void) | null } = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  let push: (chunk: Blob) => void = () => {}
  let fail: () => void = () => {}
  const media: MediaRecorderLike = {
    mimeType: 'audio/webm;codecs=opus',
    start: vi.fn((_timesliceMs: number, onData: (chunk: Blob) => void, onError?: () => void) => {
      push = onData
      fail = onError ?? (() => {})
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
    fail: () => fail(),
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
    expect(onAutoStop).toHaveBeenCalledWith(expect.objectContaining({ durationSec: MAX_RECORDING_SEC }))
    expect(f.track.stop).toHaveBeenCalled()
  })

  it('releases a stream that arrives after cancel() and never starts recording', async () => {
    let grant: (stream: { getTracks: () => { stop: () => void }[] }) => void = () => {}
    const f = fakes()
    const stream = { getTracks: () => [f.track] }
    const deps = { ...f.deps, getUserMedia: vi.fn(() => new Promise<typeof stream>((resolve) => { grant = resolve })) }
    const rec = createRecorder(deps)
    const started = rec.start()
    rec.cancel()
    grant(stream)
    await expect(started).rejects.toThrow('cancelled')
    expect(f.track.stop).toHaveBeenCalled()
    expect(deps.createMediaRecorder).not.toHaveBeenCalled()
  })

  it('releases the microphone when the meter or the encoder fails to start', async () => {
    const meterFails = fakes({ createLevelMeter: () => { throw new Error('no audio context') } })
    await expect(createRecorder(meterFails.deps).start()).rejects.toMatchObject({ code: 'unsupported' })
    expect(meterFails.track.stop).toHaveBeenCalled()

    const encoderFails = fakes()
    vi.mocked(encoderFails.media.start).mockImplementation(() => { throw new Error('boom') })
    await expect(createRecorder(encoderFails.deps).start()).rejects.toMatchObject({ code: 'unsupported' })
    expect(encoderFails.track.stop).toHaveBeenCalled()
    expect(encoderFails.meter.close).toHaveBeenCalled()
  })

  it('finishes with what it captured when the track ends or the encoder errors', async () => {
    for (const interrupt of ['track', 'encoder'] as const) {
      const f = fakes()
      const onAutoStop = vi.fn()
      const rec = createRecorder(f.deps, { onAutoStop })
      await rec.start()
      f.push(new Blob(['abc']))
      f.advance(15_000)
      if (interrupt === 'track') f.track.onended?.(new Event('ended'))
      else f.fail()
      await vi.waitFor(() => expect(onAutoStop).toHaveBeenCalledWith(expect.objectContaining({ durationSec: 15 })))
      expect(f.track.stop).toHaveBeenCalled()
    }
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
