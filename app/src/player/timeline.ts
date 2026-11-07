import type { ChordSegment, Tempo } from '../song/types'
import type { Loop } from './types'

export function chordAt(chords: ChordSegment[], t: number): ChordSegment | null {
  return chords.find((c) => c.start <= t && t < c.end) ?? null
}

export function upcomingChords(chords: ChordSegment[], t: number, count: number): ChordSegment[] {
  return chords.filter((c) => c.start > t).slice(0, count)
}

export function chordRemaining(chord: ChordSegment, t: number): number {
  const len = chord.end - chord.start
  return len > 0 ? Math.min(1, Math.max(0, (chord.end - t) / len)) : 0
}

export function beatMarks(tempo: Tempo, now: number, lookahead: number): { t: number; strong: boolean }[] {
  const strong = (t: number) => tempo.downbeats.some((d) => Math.abs(d - t) < 1e-3)
  return tempo.beats.filter((t) => t >= now && t <= now + lookahead).map((t) => ({ t, strong: strong(t) }))
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function xToTime(x: number, width: number, duration: number): number {
  if (width <= 0) return 0
  return Math.min(duration, Math.max(0, (x / width) * duration))
}

export function defaultLoop(position: number, duration: number, length = 8): Loop {
  const b = Math.min(duration, position + length)
  return { a: Math.max(0, b - length), b }
}
