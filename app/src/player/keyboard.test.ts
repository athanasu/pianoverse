import { describe, expect, it } from 'vitest'
import { isBlack, keyboardRange, layoutKeyboard } from './keyboard'

describe('keyboard', () => {
  it('pads the used range to whole octaves, at least two', () => {
    expect(keyboardRange([57, 72])).toEqual([48, 83])
    expect(keyboardRange([60, 64])).toEqual([48, 71])
    expect(keyboardRange([])).toEqual([48, 83])
    expect(keyboardRange([21, 108])).toEqual([21, 108])
  })

  it('lays out white and black keys across the width', () => {
    const k = layoutKeyboard(60, 71, 700)
    expect(k.whites).toHaveLength(7)
    expect(k.blacks).toHaveLength(5)
    expect(k.byPitch.get(62)).toMatchObject({ x: 100, w: 100, black: false })
    const cSharp = k.byPitch.get(61)!
    expect(cSharp.black).toBe(true)
    expect(cSharp.x).toBeCloseTo(100 - 58 / 2)
    expect(cSharp.w).toBeCloseTo(58)
    expect(isBlack(70)).toBe(true)
    expect(isBlack(71)).toBe(false)
  })
})
