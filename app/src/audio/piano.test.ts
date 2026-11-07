import { describe, expect, it, vi } from 'vitest'
import type { Note } from '../song/types'
import { TransportClock } from '../player/transport'
import { PianoEngine, crossedNotes, midiToToneName, salamanderUrls, type SamplerLike } from './piano'

const n = (pitch: number, start: number, end = start + 0.5): Note => ({ pitch, start, end, velocity: 100, hand: 'R' })
const notes = [n(60, 0), n(62, 1), n(64, 2), n(65, 3)]

describe('crossedNotes', () => {
  it('half-open window [prev, now)', () => {
    expect(crossedNotes(notes, 0, 1, null).map((x) => x.pitch)).toEqual([60])
    expect(crossedNotes(notes, 1, 1, null)).toEqual([])
  })
  it('loop wrap covers the tail and the head', () => {
    expect(crossedNotes(notes, 2.9, 1.2, { a: 1, b: 3.5 }).map((x) => x.pitch)).toEqual([62, 65])
  })
  it('a backwards jump without a loop sounds nothing', () => {
    expect(crossedNotes(notes, 3, 0.5, null)).toEqual([])
  })
})

describe('names and samples', () => {
  it('converts MIDI to Tone note names', () => {
    expect(midiToToneName(60)).toBe('C4')
    expect(midiToToneName(61)).toBe('C#4')
    expect(midiToToneName(21)).toBe('A0')
  })
  it('maps the Salamander sample set', () => {
    const urls = salamanderUrls()
    expect(urls.A0).toBe('A0.mp3')
    expect(urls['D#4']).toBe('Ds4.mp3')
    expect(urls['F#7']).toBe('Fs7.mp3')
    expect(urls.C8).toBe('C8.mp3')
  })
})

describe('PianoEngine', () => {
  const setup = () => {
    let t = 0
    const clock = new TransportClock(10, () => t)
    const trigger = vi.fn()
    const sampler: SamplerLike = { trigger, now: () => 50, dispose: vi.fn() }
    const engine = new PianoEngine(clock, sampler, () => notes)
    return { clock, engine, trigger, sampler, tick: (dt: number) => { t += dt } }
  }

  it('triggers each note once as the clock crosses it', () => {
    const { clock, engine, trigger, tick } = setup()
    engine.start()
    clock.play()
    tick(0.1)
    engine.tick()
    tick(1.0)
    engine.tick()
    engine.tick()
    expect(trigger.mock.calls.map((c) => c[0])).toEqual(['C4', 'D4'])
    const [, duration, time, velocity] = trigger.mock.calls[0]
    expect(duration).toBeCloseTo(0.5)
    expect(time).toBeGreaterThanOrEqual(50)
    expect(velocity).toBeCloseTo(100 / 127)
    engine.stop()
  })

  it('stays silent while paused and after a seek', () => {
    const { clock, engine, trigger, tick } = setup()
    engine.start()
    tick(2)
    engine.tick()
    clock.seek(2.5)
    clock.play()
    tick(0.2)
    engine.tick()
    expect(trigger).not.toHaveBeenCalled()
    engine.stop()
  })

  it('stretches durations at slower rates', () => {
    const { clock, engine, trigger, tick } = setup()
    engine.start()
    clock.setRate(0.5)
    clock.play()
    tick(0.1)
    engine.tick()
    expect(trigger.mock.calls[0][1]).toBeCloseTo(1)
    engine.stop()
  })
})
