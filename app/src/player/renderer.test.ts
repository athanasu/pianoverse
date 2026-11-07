import { describe, expect, it, vi } from 'vitest'
import type { Note } from '../song/types'
import { THEME } from '../styles/theme'
import { layoutKeyboard } from './keyboard'
import { buildFrame, drawFrame, type FrameInput } from './renderer'

const notes: Note[] = [
  { pitch: 60, start: 0, end: 1, velocity: 80, hand: 'L' },
  { pitch: 64, start: 0.5, end: 2, velocity: 80, hand: 'R' },
  { pitch: 67, start: 2, end: 3, velocity: 80, hand: 'R' },
]
const input = (over: Partial<FrameInput> = {}): FrameInput => ({
  notes, layout: layoutKeyboard(60, 71, 700), tempo: { bpm: 60, beats: [0, 1, 2, 3], downbeats: [0] },
  now: 0.75, lookahead: 3, width: 700, height: 300, keyboardHeight: 80,
  hands: { L: true, R: true }, names: false, lang: 'en', ...over,
})

describe('buildFrame', () => {
  it('collects visible notes, lit keys, beats and lanes', () => {
    const f = buildFrame(input())
    expect(f.rollHeight).toBe(220)
    expect(f.rects).toHaveLength(3)
    expect([...f.lit]).toEqual([[60, 'L'], [64, 'R']])
    expect(f.beatLines.map((b) => b.strong)).toEqual([false, false, false])
    expect(f.lanes).toHaveLength(2)
    expect(f.cLabels).toEqual([{ x: 50, label: 'C4', pitch: 60 }])
  })

  it('dims a switched-off hand and leaves its keys unlit', () => {
    const f = buildFrame(input({ hands: { L: false, R: true } }))
    expect(f.rects.find((r) => r.pitch === 60)?.dim).toBe(true)
    expect(f.lit.has(60)).toBe(false)
  })

  it('labels tall white-key notes in the chosen language', () => {
    const f = buildFrame(input({ names: true, lang: 'el' }))
    expect(f.rects.find((r) => r.pitch === 64)?.label).toBe('Μι')
  })
})

describe('drawFrame', () => {
  it('draws every note and key, lighting active keys in the hand colour', () => {
    const fills: unknown[] = []
    const ctx: Record<string, unknown> = {
      fillStyle: '',
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fillText: vi.fn(),
      fill: vi.fn(() => fills.push(ctx.fillStyle)),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1, shadowColor: '', shadowBlur: 0, font: '', textAlign: '', textBaseline: '',
    }
    const f = buildFrame(input())
    drawFrame(ctx as unknown as CanvasRenderingContext2D, f)
    expect(ctx.roundRect).toHaveBeenCalledTimes(f.rects.length + f.whites.length + f.blacks.length)
    expect(fills).toContain(THEME.left)
    expect(fills).toContain(THEME.right)
    expect(fills).toContain(THEME.keyWhite)
  })
  it('draws black-key notes after overlapping white-key notes', () => {
    const xs: number[] = []
    const ctx: Record<string, unknown> = {
      fillStyle: '',
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), fillText: vi.fn(), fill: vi.fn(),
      roundRect: vi.fn((x: number) => xs.push(x)),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1, shadowColor: '', shadowBlur: 0, font: '', textAlign: '', textBaseline: '',
    }
    const together: Note[] = [
      { pitch: 61, start: 0, end: 1, velocity: 80, hand: 'R' },
      { pitch: 60, start: 0, end: 1, velocity: 80, hand: 'L' },
    ]
    const f = buildFrame(input({ notes: together }))
    drawFrame(ctx as unknown as CanvasRenderingContext2D, f)
    const whiteX = f.rects.find((r) => r.pitch === 60)!.x
    const blackX = f.rects.find((r) => r.pitch === 61)!.x
    expect(blackX).not.toBe(whiteX)
    expect(xs.indexOf(whiteX)).toBeLessThan(xs.indexOf(blackX))
  })
  it('lights white keys after all unlit white keys', () => {
    const fills: unknown[] = []
    const ctx: Record<string, unknown> = {
      fillStyle: '',
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fillText: vi.fn(),
      fill: vi.fn(() => fills.push(ctx.fillStyle)),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1, shadowColor: '', shadowBlur: 0, font: '', textAlign: '', textBaseline: '',
    }
    drawFrame(ctx as unknown as CanvasRenderingContext2D, buildFrame(input({ notes: [notes[0]!], now: 0.5 })))
    const lastUnlit = fills.lastIndexOf(THEME.keyWhite)
    const lit = fills.indexOf(THEME.left, fills.indexOf(THEME.keyWhite))
    expect(lit).toBeGreaterThan(lastUnlit)
  })

  it.each([
    ['zero width', { width: 0, layout: layoutKeyboard(60, 71, 0) }],
    ['height below keyboard height', { height: 40 }],
  ])('does not throw with %s', (_, over) => {
    const ctx: Record<string, unknown> = {
      fillStyle: '',
      clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), fillText: vi.fn(), fill: vi.fn(),
      roundRect: vi.fn((_x: number, _y: number, _w: number, _h: number, r: number | number[]) => {
        if ([r].flat().some((v) => v < 0)) throw new RangeError('negative radius')
      }),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      globalAlpha: 1, shadowColor: '', shadowBlur: 0, font: '', textAlign: '', textBaseline: '',
    }
    expect(() => drawFrame(ctx as unknown as CanvasRenderingContext2D, buildFrame(input(over)))).not.toThrow()
  })
})
