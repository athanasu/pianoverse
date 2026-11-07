import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayer } from './store'

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

  it('cycles speed 100 → 25 → 50 → 75 → 100', () => {
    const s = usePlayer.getState
    expect(s().speed).toBe(1)
    for (const expected of [0.25, 0.5, 0.75, 1]) {
      s().cycleSpeed()
      expect(s().speed).toBe(expected)
    }
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
