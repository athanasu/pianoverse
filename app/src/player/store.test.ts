import { beforeEach, describe, expect, it } from 'vitest'
import { SPEED_MAX, SPEED_MIN, speedPercent, usePlayer } from './store'

describe('player store', () => {
  beforeEach(() => usePlayer.getState().reset(['easy', 'medium', 'hard']))

  it('starts on medium when available, else the first level', () => {
    expect(usePlayer.getState().level).toBe('medium')
    usePlayer.getState().reset(['original'])
    expect(usePlayer.getState().level).toBe('original')
  })

  it('reset clears the loop but keeps view preferences', () => {
    usePlayer.getState().setLoop({ a: 1, b: 5 })
    usePlayer.getState().toggleNames()
    usePlayer.getState().reset(['easy'])
    expect(usePlayer.getState().loop).toBeNull()
    expect(usePlayer.getState().names).toBe(true)
    usePlayer.getState().toggleNames()
  })

  it('sets the speed in percent, snapped to 5% steps', () => {
    const s = usePlayer.getState
    expect(s().speed).toBe(1)
    s().setSpeedPercent(85)
    expect(s().speed).toBe(0.85)
    s().setSpeedPercent(62)
    expect(s().speed).toBe(0.6)
    s().setSpeedPercent(150)
    expect(s().speed).toBe(1.5)
    expect(speedPercent(s().speed)).toBe(150)
    s().setSpeedPercent(100)
  })

  it('steps the speed by 5% and stops at the limits', () => {
    const s = usePlayer.getState
    s().stepSpeed(1)
    s().stepSpeed(1)
    expect(s().speed).toBe(1.1)
    s().stepSpeed(-1)
    expect(s().speed).toBe(1.05)
    s().setSpeedPercent(SPEED_MAX)
    s().stepSpeed(1)
    expect(s().speed).toBe(SPEED_MAX / 100)
    s().setSpeedPercent(SPEED_MIN)
    s().stepSpeed(-1)
    expect(s().speed).toBe(SPEED_MIN / 100)
    s().setSpeedPercent(100)
  })

  it('keeps the speed between 25% and 200%', () => {
    const s = usePlayer.getState
    s().setSpeedPercent(5)
    expect(s().speed).toBe(SPEED_MIN / 100)
    s().setSpeedPercent(900)
    expect(s().speed).toBe(SPEED_MAX / 100)
    s().setSpeedPercent(100)
  })

  it('toggles hands and the chord card independently', () => {
    usePlayer.getState().toggleHand('L')
    expect(usePlayer.getState().hands).toEqual({ L: false, R: true })
    usePlayer.getState().toggleHand('L')
    const card = usePlayer.getState().card
    usePlayer.getState().toggleCard()
    expect(usePlayer.getState().card).toBe(!card)
  })
})
