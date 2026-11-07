import { describe, expect, it, vi } from 'vitest'
import type { Note } from '../song/types'
import { TransportClock } from '../player/transport'
import { AUDIO_LATENCY, PianoEngine, VISUAL_OFFSET, audibleNotes, crossedNotes, midiToToneName, salamanderUrls, visualTime, type SamplerLike } from './piano'

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

describe('audibleNotes', () => {
  const both = [n(48, 0), { ...n(72, 0), hand: 'R' as const }, { ...n(43, 1), hand: 'L' as const }]
  const hands = (o: Note[]) => o.map((x) => x.hand).join('')
  it('both hands on: both sound', () => {
    expect(hands(audibleNotes(both, { L: true, R: true }))).toBe('RRL')
  })
  it('only L on: the user plays L, the app sounds R', () => {
    expect(hands(audibleNotes(both, { L: true, R: false }))).toBe('RR')
  })
  it('only R on: the user plays R, the app sounds L', () => {
    expect(hands(audibleNotes(both, { L: false, R: true }))).toBe('L')
  })
  it('both hands off: both sound', () => {
    expect(hands(audibleNotes(both, { L: false, R: false }))).toBe('RRL')
  })
})

describe('visualTime', () => {
  it('draws VISUAL_OFFSET wall seconds behind, measured in song time', () => {
    expect(visualTime(10, 1)).toBeCloseTo(10 - VISUAL_OFFSET)
    expect(visualTime(10, 0.25)).toBeCloseTo(10 - VISUAL_OFFSET * 0.25)
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
    const releaseAll = vi.fn()
    const sampler: SamplerLike = { trigger, releaseAll, now: () => 50, dispose: vi.fn() }
    const engine = new PianoEngine(clock, sampler, () => notes)
    return { clock, engine, trigger, releaseAll, sampler, tick: (dt: number) => { t += dt } }
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

  it('schedules at base + max(0, latency - lateness / rate)', () => {
    const a = setup()
    a.engine.start()
    a.clock.play()
    a.tick(0.1)
    a.engine.tick()
    expect(a.trigger.mock.calls[0][2]).toBeCloseTo(50 + Math.max(0, AUDIO_LATENCY - 0.1))
    a.engine.stop()
    const b = setup()
    b.engine.start()
    b.clock.play()
    b.tick(0.02)
    b.engine.tick()
    expect(b.trigger.mock.calls[0][2]).toBeCloseTo(50 + AUDIO_LATENCY - 0.02)
    b.engine.stop()
    const c = setup()
    c.engine.start()
    c.clock.setRate(0.5)
    c.clock.play()
    c.tick(0.02) // 0.01 s of song time late 0.01 -> 0.02 wall
    c.engine.tick()
    expect(c.trigger.mock.calls[0][2]).toBeCloseTo(50 + AUDIO_LATENCY - 0.02 / 0.5 * 0.5)
    c.engine.stop()
  })

  it('sounds notes once across an engine-level loop wrap', () => {
    const { clock, engine, trigger, tick } = setup()
    clock.setLoop({ a: 1, b: 3.5 })
    clock.seek(3.0)
    engine.start()
    clock.play()
    tick(0.4)
    engine.tick()
    tick(0.2) // 3.4 -> wraps to 1.1
    engine.tick()
    tick(0.2)
    engine.tick()
    const names = trigger.mock.calls.map((c) => c[0])
    expect(names.filter((x) => x === 'F4')).toHaveLength(1)
    expect(names.filter((x) => x === 'D4')).toHaveLength(1)
    expect(names).toHaveLength(2)
    engine.stop()
  })

  it('a setRate during playback does not drop a just-crossed note', () => {
    const { clock, engine, trigger, tick } = setup()
    engine.start()
    clock.play()
    tick(0.1)
    clock.setRate(0.5)
    engine.tick()
    expect(trigger.mock.calls.map((c) => c[0])).toEqual(['C4'])
    engine.stop()
  })

  it('a seek while playing resets the window', () => {
    const { clock, engine, trigger, tick } = setup()
    engine.start()
    clock.play()
    tick(0.5)
    engine.tick()
    trigger.mockClear()
    clock.seek(2.5)
    tick(0.01)
    engine.tick()
    expect(trigger).not.toHaveBeenCalled()
    engine.stop()
  })

  it('releases sounding notes on pause', () => {
    const { clock, engine, releaseAll, tick } = setup()
    engine.start()
    clock.play()
    tick(0.5)
    engine.tick()
    clock.pause()
    expect(releaseAll).toHaveBeenCalled()
    engine.stop()
  })

  it('releases sounding notes on a backward seek', () => {
    const { clock, engine, releaseAll, tick } = setup()
    engine.start()
    clock.play()
    tick(1.2)
    engine.tick()
    clock.seek(0.5)
    expect(releaseAll).toHaveBeenCalled()
    engine.stop()
  })

  it('keeps notes sounding across a setRate while playing', () => {
    const { clock, engine, releaseAll, tick } = setup()
    engine.start()
    clock.play()
    tick(0.5)
    engine.tick()
    clock.setRate(0.5)
    expect(releaseAll).not.toHaveBeenCalled()
    engine.stop()
  })

  it('silence() releases sounding notes', () => {
    const { engine, releaseAll } = setup()
    engine.start()
    engine.silence()
    expect(releaseAll).toHaveBeenCalledTimes(1)
    engine.stop()
  })
})
