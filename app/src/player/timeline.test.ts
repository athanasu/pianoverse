import { describe, expect, it } from 'vitest'
import type { ChordSegment } from '../song/types'
import { beatMarks, chordAt, chordRemaining, defaultLoop, formatTime, upcomingChords, xToTime } from './timeline'

const c = (start: number, end: number, symbol: string): ChordSegment => ({ start, end, symbol, root: symbol[0], quality: 'maj' })
const chords = [c(0, 2, 'C'), c(2, 4, 'F'), c(4, 6, 'G'), c(6, 8, 'C')]

describe('timeline', () => {
  it('finds the current and next chords', () => {
    expect(chordAt(chords, 2.5)?.symbol).toBe('F')
    expect(chordAt(chords, 9)).toBeNull()
    expect(upcomingChords(chords, 2.5, 2).map((x) => x.symbol)).toEqual(['G', 'C'])
    expect(chordRemaining(chords[1], 2.5)).toBeCloseTo(0.75)
  })

  it('lists beats in view and marks downbeats', () => {
    const marks = beatMarks({ bpm: 120, beats: [0, 0.5, 1, 1.5, 2], downbeats: [0, 2] }, 0.4, 1.2)
    expect(marks).toEqual([{ t: 0.5, strong: false }, { t: 1, strong: false }, { t: 1.5, strong: false }])
    expect(beatMarks({ bpm: 120, beats: [2], downbeats: [2] }, 1.5, 1)).toEqual([{ t: 2, strong: true }])
  })

  it('formats and converts time', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75.9)).toBe('1:15')
    expect(xToTime(50, 200, 40)).toBe(10)
    expect(xToTime(-5, 200, 40)).toBe(0)
    expect(xToTime(500, 200, 40)).toBe(40)
  })

  it('default loop is 8 s from the playhead, clamped to the end', () => {
    expect(defaultLoop(3, 60)).toEqual({ a: 3, b: 11 })
    expect(defaultLoop(57, 60)).toEqual({ a: 52, b: 60 })
  })
})
