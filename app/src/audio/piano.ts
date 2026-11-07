import type { Note } from '../song/types'
import type { PlaybackClock } from '../player/transport'
import type { Loop } from '../player/types'

export const AUDIO_LATENCY = 0.05
// The canvas draws this far behind the clock so notes hit the keyboard when they sound.
// Notes are scheduled at the context's currentTime + AUDIO_LATENCY (not Tone.now(), which adds Tone's lookAhead).
export const VISUAL_OFFSET = AUDIO_LATENCY
// A clock notification that moves time further than this (or backwards) is a seek/restart, not normal playback.
const DISCONTINUITY = 0.5

// Audio sounds VISUAL_OFFSET wall seconds late; at a slower rate that is fewer song seconds.
export function visualTime(now: number, rate: number): number {
  return now - VISUAL_OFFSET * rate
}

const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/'
const TONE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function crossedNotes(notes: Note[], prev: number, now: number, loop: Loop | null): Note[] {
  if (now >= prev) return notes.filter((n) => n.start >= prev && n.start < now)
  if (!loop) return []
  return notes.filter((n) => (n.start >= prev && n.start < loop.b) || (n.start >= loop.a && n.start < now))
}

export function midiToToneName(midi: number): string {
  return `${TONE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

export function salamanderUrls(): Record<string, string> {
  const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' }
  for (let o = 1; o <= 7; o++) {
    urls[`C${o}`] = `C${o}.mp3`
    urls[`D#${o}`] = `Ds${o}.mp3`
    urls[`F#${o}`] = `Fs${o}.mp3`
    urls[`A${o}`] = `A${o}.mp3`
  }
  return urls
}

export interface SamplerLike {
  trigger(note: string, duration: number, time: number, velocity: number): void
  releaseAll(): void
  now(): number
  dispose(): void
}

export class PianoEngine {
  private prev = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private unsubscribe: (() => void) | null = null
  private readonly clock: PlaybackClock
  private readonly sampler: SamplerLike
  private readonly getNotes: () => Note[]

  constructor(clock: PlaybackClock, sampler: SamplerLike, getNotes: () => Note[]) {
    this.clock = clock
    this.sampler = sampler
    this.getNotes = getNotes
  }

  start(): void {
    if (this.timer) return
    this.prev = this.clock.now()
    this.unsubscribe = this.clock.subscribe(() => {
      const now = this.clock.now()
      const jumped = now < this.prev || now - this.prev > DISCONTINUITY
      if (jumped) this.prev = now
      if (jumped || !this.clock.isPlaying()) this.sampler.releaseAll()
    })
    this.timer = setInterval(() => this.tick(), 25)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.unsubscribe?.()
    this.unsubscribe = null
    this.sampler.dispose()
  }

  silence(): void {
    this.sampler.releaseAll()
  }

  tick(): void {
    const now = this.clock.now()
    if (!this.clock.isPlaying()) {
      this.prev = now
      return
    }
    const rate = this.clock.rate()
    const base = this.sampler.now()
    for (const n of crossedNotes(this.getNotes(), this.prev, now, this.clock.loop())) {
      const late = Math.max(0, now - n.start) / rate
      const duration = Math.max(0.05, (n.end - n.start) / rate)
      this.sampler.trigger(midiToToneName(n.pitch), duration, base + Math.max(0, AUDIO_LATENCY - late), n.velocity / 127)
    }
    this.prev = now
  }
}

type ToneModule = typeof import('tone')
let toneModule: ToneModule | null = null
let tonePromise: Promise<ToneModule> | null = null

export function preloadTone(): Promise<ToneModule> {
  tonePromise ??= import('tone')
    .then((m) => (toneModule = m))
    .catch((e: unknown) => {
      tonePromise = null
      throw e
    })
  return tonePromise
}

// Must run synchronously inside the click handler: iOS only unlocks audio within the user gesture.
export function unlockAudio(): void {
  void toneModule?.start()
}

// Needs no user gesture: samples decode while the context is suspended; unlockAudio() resumes it on Play.
export async function createSampler(): Promise<SamplerLike> {
  const Tone = await preloadTone()
  const sampler = new Tone.Sampler({ urls: salamanderUrls(), baseUrl: SALAMANDER_BASE, release: 1 }).toDestination()
  try {
    await Tone.loaded()
  } catch (e) {
    sampler.dispose()
    throw e
  }
  return {
    trigger: (note, duration, time, velocity) => sampler.triggerAttackRelease(note, duration, time, velocity),
    releaseAll: () => sampler.releaseAll(),
    now: () => Tone.immediate(),
    dispose: () => sampler.dispose(),
  }
}
