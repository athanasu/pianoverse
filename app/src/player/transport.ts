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

// Loop wraps do not notify: while a loop is set, now() going backwards means the playhead wrapped.
// isPlaying() does not advance time; the end of the song is noticed and notified on the next now().
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

function sameLoop(x: Loop | null, y: Loop | null): boolean {
  if (x === null || y === null) return x === y
  return x.a === y.a && x.b === y.b
}

export class TransportClock implements PlaybackClock {
  private state: TransportState
  private last: number
  // The state listeners were last notified of; mutators compare against it to skip no-op notifications.
  private snapshot: TransportState
  private readonly timeSource: () => number
  private readonly listeners = new Set<() => void>()

  constructor(duration: number, timeSource: () => number = () => performance.now() / 1000) {
    this.timeSource = timeSource
    this.last = timeSource()
    this.state = { position: 0, playing: false, rate: 1, loop: null, duration }
    this.snapshot = this.state
  }

  now(): number {
    this.sync(true)
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
    this.sync(false)
    const restart = this.state.position >= this.state.duration
    this.state = { ...this.state, playing: true, position: restart ? 0 : this.state.position }
    this.commit(restart)
  }

  pause(): void {
    this.sync(false)
    this.state = { ...this.state, playing: false }
    this.commit()
  }

  seek(t: number): void {
    this.sync(false)
    this.state = { ...this.state, position: Math.min(this.state.duration, Math.max(0, t)) }
    this.emit()
  }

  setRate(rate: number): void {
    this.sync(false)
    this.state = { ...this.state, rate }
    this.commit()
  }

  setLoop(loop: Loop | null): void {
    this.sync(false)
    const valid = loop && loop.b - loop.a >= MIN_LOOP ? loop : null
    let position = this.state.position
    if (valid && (position < valid.a || position >= valid.b)) position = valid.a
    this.state = { ...this.state, loop: valid, position }
    this.commit()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private sync(notifyOnStop: boolean): void {
    const t = this.timeSource()
    const dt = t - this.last
    this.last = t
    this.state = advance(this.state, dt)
    if (notifyOnStop) this.commit()
  }

  // Emits only when what listeners last saw differs from the current state. `jumped` covers
  // position discontinuities that are not visible in playing, rate or loop (restart from end).
  private commit(jumped = false): void {
    const s = this.state
    const seen = this.snapshot
    const changed =
      jumped || s.playing !== seen.playing || s.rate !== seen.rate || !sameLoop(s.loop, seen.loop)
    if (changed) this.emit()
  }

  private emit(): void {
    this.snapshot = this.state
    for (const fn of this.listeners) fn()
  }
}
