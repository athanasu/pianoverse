import { describe, expect, it } from 'vitest'
import type { Note } from '../song/types'
import { layoutKeyboard } from './keyboard'
import { activeKeys, visibleNoteRects } from './roll'

const n = (pitch: number, start: number, end: number, hand: 'L' | 'R' = 'R'): Note => ({ pitch, start, end, velocity: 80, hand })
const layout = layoutKeyboard(60, 71, 700)

describe('visibleNoteRects', () => {
  it('maps time to height: future notes above the hit line', () => {
    // lookahead 2 s over 200 px → 100 px per second; note 1–1.5 s ahead
    const [r] = visibleNoteRects([n(62, 1, 1.5)], layout, 0, 2, 200)
    expect(r.y).toBeCloseTo(50)
    expect(r.h).toBeCloseTo(50)
    expect(r.x).toBe(102)
    expect(r.w).toBe(96)
    expect(r.active).toBe(false)
  })

  it('clips notes crossing the hit line and marks them active', () => {
    const [r] = visibleNoteRects([n(60, 0.5, 1.5)], layout, 1, 2, 200)
    expect(r.y).toBeCloseTo(150)
    expect(r.h).toBeCloseTo(50)
    expect(r.active).toBe(true)
  })

  it('drops past, far-future and off-keyboard notes', () => {
    const rects = visibleNoteRects([n(60, 0, 0.5), n(60, 5, 6), n(90, 1, 2)], layout, 1, 2, 200)
    expect(rects).toEqual([])
  })
})

describe('activeKeys', () => {
  it('lists sounding pitches with their hand', () => {
    const keys = activeKeys([n(60, 0, 1, 'L'), n(64, 0.5, 2, 'R'), n(67, 2, 3)], 0.75)
    expect([...keys]).toEqual([[60, 'L'], [64, 'R']])
  })
})
