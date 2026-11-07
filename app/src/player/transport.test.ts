import { describe, expect, it, vi } from 'vitest'
import { TransportClock, advance, type TransportState } from './transport'

const base: TransportState = { position: 0, playing: true, rate: 1, loop: null, duration: 10 }

describe('advance', () => {
  it('moves at the playback rate and stops when paused', () => {
    expect(advance({ ...base, rate: 0.5 }, 2).position).toBeCloseTo(1)
    expect(advance({ ...base, playing: false }, 2).position).toBe(0)
  })

  it('stops at the end', () => {
    const s = advance({ ...base, position: 9.5 }, 1)
    expect(s.position).toBe(10)
    expect(s.playing).toBe(false)
  })

  it('wraps inside an A–B loop', () => {
    const s = advance({ ...base, position: 3.8, loop: { a: 2, b: 4 } }, 0.5)
    expect(s.position).toBeCloseTo(2.3)
    expect(s.playing).toBe(true)
  })
})

describe('TransportClock', () => {
  const make = () => {
    let t = 100
    const clock = new TransportClock(10, () => t)
    return { clock, tick: (dt: number) => { t += dt } }
  }

  it('advances only while playing, at the set rate', () => {
    const { clock, tick } = make()
    tick(1)
    expect(clock.now()).toBe(0)
    clock.play()
    tick(1)
    expect(clock.now()).toBeCloseTo(1)
    clock.setRate(0.5)
    tick(2)
    expect(clock.now()).toBeCloseTo(2)
    clock.pause()
    tick(5)
    expect(clock.now()).toBeCloseTo(2)
  })

  it('seeks within bounds and restarts from 0 after the end', () => {
    const { clock, tick } = make()
    clock.seek(-3)
    expect(clock.now()).toBe(0)
    clock.seek(9.9)
    clock.play()
    tick(1)
    expect(clock.now()).toBe(10)
    expect(clock.isPlaying()).toBe(false)
    clock.play()
    expect(clock.now()).toBe(0)
  })

  it('loop jumps into range, ignores tiny loops', () => {
    const { clock, tick } = make()
    clock.seek(7)
    clock.setLoop({ a: 2, b: 4 })
    expect(clock.now()).toBe(2)
    clock.play()
    tick(2.5)
    expect(clock.now()).toBeCloseTo(2.5)
    clock.setLoop({ a: 5, b: 5.1 })
    expect(clock.loop()).toBeNull()
  })

  it('notifies listeners, including when playback ends', () => {
    const { clock, tick } = make()
    const fn = vi.fn()
    const off = clock.subscribe(fn)
    clock.play()
    clock.setRate(0.75)
    expect(fn).toHaveBeenCalledTimes(2)
    clock.seek(9.9)
    tick(1)
    clock.now()
    expect(fn).toHaveBeenCalledTimes(4)
    off()
    clock.pause()
    expect(fn).toHaveBeenCalledTimes(4)
  })
})
