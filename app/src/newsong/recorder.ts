// The server rejects decoded audio under 10 s or over 480 s, and the browser's own timing is only
// approximate, so the client keeps a margin on both sides.
export const MAX_RECORDING_SEC = 478
export const MIN_RECORDING_SEC = 10.5

export type RecorderErrorCode = 'denied' | 'no_mic' | 'insecure' | 'unsupported'

export class RecorderError extends Error {
  readonly code: RecorderErrorCode

  constructor(code: RecorderErrorCode) {
    super(code)
    this.name = 'RecorderError'
    this.code = code
  }
}

export interface StreamLike {
  getTracks(): { stop(): void; onended?: ((ev: Event) => void) | null }[]
}

export interface MediaRecorderLike {
  readonly mimeType: string
  start(timesliceMs: number, onData: (chunk: Blob) => void, onError?: () => void): void
  /** Resolves after the last chunk has been delivered. */
  stop(): Promise<void>
}

export interface LevelMeter {
  level(): number
  close(): void
}

export interface RecorderDeps {
  isSecureContext: boolean
  getUserMedia: ((constraints: { audio: true }) => Promise<StreamLike>) | null
  createMediaRecorder: ((stream: StreamLike, mimeType: string | undefined) => MediaRecorderLike) | null
  isTypeSupported: (mimeType: string) => boolean
  createLevelMeter: (stream: StreamLike) => LevelMeter | null
  now: () => number
}

export interface Recording {
  blob: Blob
  mimeType: string
  filename: string
  durationSec: number
  startedAt: Date
}

export interface Recorder {
  start(): Promise<void>
  stop(): Promise<Recording>
  elapsedSec(): number
  level(): number
  cancel(): void
}

// Chrome/Firefox record webm/opus, Safari only mp4/aac; the server's ffprobe reads all of them.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']

export function pickMimeType(isTypeSupported: (mimeType: string) => boolean): string | undefined {
  return MIME_CANDIDATES.find((t) => isTypeSupported(t))
}

export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('audio/webm')) return '.webm'
  if (mimeType.startsWith('audio/mp4')) return '.m4a'
  if (mimeType.startsWith('audio/ogg')) return '.ogg'
  return '.bin'
}

export function rms(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const v of samples) {
    const x = (v - 128) / 128
    sum += x * x
  }
  return Math.sqrt(sum / samples.length)
}

function mediaError(e: unknown): RecorderError {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : ''
  return new RecorderError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'no_mic')
}

function wrapMediaRecorder(media: MediaRecorder): MediaRecorderLike {
  return {
    get mimeType() {
      return media.mimeType
    },
    start(timesliceMs, onData, onError) {
      media.onerror = () => onError?.()
      media.ondataavailable = (e) => {
        if (e.data.size > 0) onData(e.data)
      }
      media.start(timesliceMs)
    },
    stop() {
      return new Promise((resolve) => {
        if (media.state === 'inactive') return resolve()
        media.onstop = () => resolve()
        media.stop()
      })
    },
  }
}

function browserLevelMeter(stream: StreamLike): LevelMeter | null {
  if (typeof AudioContext === 'undefined') return null
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  ctx.createMediaStreamSource(stream as MediaStream).connect(analyser)
  // Created after an await, so Safari may leave it suspended and the analyser silent.
  void ctx.resume()
  const samples = new Uint8Array(analyser.fftSize)
  return {
    level() {
      analyser.getByteTimeDomainData(samples)
      return rms(samples)
    },
    close() {
      void ctx.close()
    },
  }
}

export function browserRecorderDeps(): RecorderDeps {
  // mediaDevices is undefined on insecure origins even though the DOM types say otherwise.
  const devices = (typeof navigator === 'undefined' ? undefined : navigator.mediaDevices) as MediaDevices | undefined
  const Media = typeof MediaRecorder === 'undefined' ? null : MediaRecorder
  return {
    isSecureContext: globalThis.isSecureContext ?? false,
    getUserMedia: devices ? (constraints) => devices.getUserMedia(constraints) : null,
    createMediaRecorder: Media
      ? (stream, mimeType) => wrapMediaRecorder(new Media(stream as MediaStream, mimeType ? { mimeType } : undefined))
      : null,
    isTypeSupported: (mimeType) => Media?.isTypeSupported(mimeType) ?? false,
    createLevelMeter: browserLevelMeter,
    now: () => Date.now(),
  }
}

export function createRecorder(
  deps: RecorderDeps = browserRecorderDeps(),
  opts: { onAutoStop?: (recording: Recording) => void } = {},
): Recorder {
  let stream: StreamLike | null = null
  let media: MediaRecorderLike | null = null
  let meter: LevelMeter | null = null
  let chunks: Blob[] = []
  let startedAt: number | null = null
  let stoppedAt: number | null = null
  let autoStop: ReturnType<typeof setTimeout> | undefined
  let cancelled = false

  const release = () => {
    clearTimeout(autoStop)
    meter?.close()
    meter = null
    stream?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    stream = null
    media = null
  }

  // Stops by itself at the limit, or when the microphone or encoder dies mid-take.
  const finishByItself = () => {
    stop().then((recording) => opts.onAutoStop?.(recording), () => undefined)
  }

  async function start(): Promise<void> {
    if (!deps.isSecureContext) throw new RecorderError('insecure')
    if (!deps.getUserMedia || !deps.createMediaRecorder) throw new RecorderError('unsupported')
    cancelled = false
    let opened: StreamLike
    try {
      opened = await deps.getUserMedia({ audio: true })
    } catch (e) {
      throw mediaError(e)
    }
    stream = opened
    // cancel() may have run while the permission prompt was open; nobody owns this stream any more.
    if (cancelled) {
      release()
      throw new Error('cancelled')
    }
    try {
      media = deps.createMediaRecorder(opened, pickMimeType(deps.isTypeSupported))
      chunks = []
      meter = deps.createLevelMeter(opened)
      media.start(1000, (chunk) => chunks.push(chunk), finishByItself)
    } catch {
      release()
      throw new RecorderError('unsupported')
    }
    opened.getTracks().forEach((track) => {
      track.onended = () => finishByItself()
    })
    startedAt = deps.now()
    stoppedAt = null
    autoStop = setTimeout(finishByItself, MAX_RECORDING_SEC * 1000)
  }

  async function stop(): Promise<Recording> {
    const current = media
    const begin = startedAt
    if (!current || begin === null) throw new Error('not recording')
    media = null
    clearTimeout(autoStop)
    const end = deps.now()
    stoppedAt = end
    await current.stop()
    release()
    const mimeType = current.mimeType || 'audio/webm'
    return {
      blob: new Blob(chunks, { type: mimeType }),
      mimeType,
      filename: `recording${extensionFor(mimeType)}`,
      durationSec: (end - begin) / 1000,
      startedAt: new Date(begin),
    }
  }

  return {
    start,
    stop,
    elapsedSec: () => (startedAt === null ? 0 : ((stoppedAt ?? deps.now()) - startedAt) / 1000),
    level: () => meter?.level() ?? 0,
    cancel() {
      cancelled = true
      const current = media
      release()
      void current?.stop().catch(() => undefined)
    },
  }
}
