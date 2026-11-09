import { describe, expect, it } from 'vitest'
import { STEPS, stepStates } from './steps'

describe('stepStates', () => {
  it.each([
    ['queued', ['pending', 'pending', 'pending', 'pending']],
    ['separating', ['active', 'pending', 'pending', 'pending']],
    ['analyzing', ['done', 'active', 'pending', 'pending']],
    ['melody', ['done', 'done', 'active', 'pending']],
    ['arranging', ['done', 'done', 'done', 'active']],
    ['done', ['done', 'done', 'done', 'done']],
    ['failed', ['pending', 'pending', 'pending', 'pending']],
  ] as const)('%s', (status, expected) => {
    expect(stepStates(status).map((s) => s.state)).toEqual(expected)
  })

  it('keeps the screen order', () => {
    expect(stepStates('queued').map((s) => s.id)).toEqual(STEPS)
    expect(STEPS).toEqual(['separating', 'analyzing', 'melody', 'arranging'])
  })
})
