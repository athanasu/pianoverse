import type { Loop } from './types'

export interface TransportState {
  position: number
  playing: boolean
  rate: number
  loop: Loop | null
  duration: number
}

const MIN_LOOP = 0.25

export function advance(s: TransportState, dt: number): TransportState {
  if (!s.playing || dt <= 0) return s
  const p = s.position + dt * s.rate
  if (s.loop && s.position < s.loop.b && p >= s.loop.b) {
    const len = s.loop.b - s.loop.a
    return { ...s, position: s.loop.a + ((p - s.loop.b) % len) }
  }
  if (p >= s.duration) return { ...s, position: s.duration, playing: false }
  return { ...s, position: p }
}

export interface PlaybackClock {
  now(): number
  isPlaying(): boolean
  rate(): number
  loop(): Loop | null
  play(): void
  pause(): void
  seek(t: number): void
  setRate(rate: number): void
  setLoop(loop: Loop | null): void
  subscribe(fn: () => void): () => void
}

export class TransportClock implements PlaybackClock {
  private state: TransportState
  private last: number
  private readonly timeSource: () => number
  private readonly listeners = new Set<() => void>()

  constructor(duration: number, timeSource: () => number = () => performance.now() / 1000) {
    this.timeSource = timeSource
    this.last = timeSource()
    this.state = { position: 0, playing: false, rate: 1, loop: null, duration }
  }

  now(): number {
    this.sync()
    return this.state.position
  }

  isPlaying(): boolean {
    return this.state.playing
  }

  rate(): number {
    return this.state.rate
  }

  loop(): Loop | null {
    return this.state.loop
  }

  play(): void {
    this.sync()
    const atEnd = this.state.position >= this.state.duration
    this.state = { ...this.state, playing: true, position: atEnd ? 0 : this.state.position }
    this.emit()
  }

  pause(): void {
    this.sync()
    this.state = { ...this.state, playing: false }
    this.emit()
  }

  seek(t: number): void {
    this.sync()
    this.state = { ...this.state, position: Math.min(this.state.duration, Math.max(0, t)) }
    this.emit()
  }

  setRate(rate: number): void {
    this.sync()
    this.state = { ...this.state, rate }
    this.emit()
  }

  setLoop(loop: Loop | null): void {
    this.sync()
    const valid = loop && loop.b - loop.a >= MIN_LOOP ? loop : null
    let position = this.state.position
    if (valid && (position < valid.a || position >= valid.b)) position = valid.a
    this.state = { ...this.state, loop: valid, position }
    this.emit()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private sync(): void {
    const t = this.timeSource()
    const dt = t - this.last
    this.last = t
    const wasPlaying = this.state.playing
    this.state = advance(this.state, dt)
    if (wasPlaying && !this.state.playing) this.emit()
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}
