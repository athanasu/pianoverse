import { describe, expect, it } from 'vitest'
import { defaultTitle } from './title'

describe('defaultTitle', () => {
  it('uses the file name without its extension', () => {
    expect(defaultTitle({ kind: 'file', name: 'Take Five.mp3' }, 'el')).toBe('Take Five')
    expect(defaultTitle({ kind: 'file', name: 'demo.final.m4a' }, 'en')).toBe('demo.final')
    expect(defaultTitle({ kind: 'file', name: '.mp3' }, 'en')).toBe('.mp3')
  })

  it('names recordings by date and time in the UI language', () => {
    const at = new Date(2026, 10, 9, 14, 32)
    expect(defaultTitle({ kind: 'recording', at }, 'el')).toBe('Ηχογράφηση 9 Νοε, 14:32')
    expect(defaultTitle({ kind: 'recording', at }, 'en')).toBe('Recording Nov 9, 14:32')
  })
})
