import { describe, expect, it } from 'vitest'
import { chordLongName, chordTones, fingeringFor, keyName, noteName, pcOf, pitchClassName } from './music'

describe('music names', () => {
  it('names notes per language', () => {
    expect(noteName(60, 'el')).toBe('Ντο')
    expect(noteName(69, 'en')).toBe('A')
    expect(noteName(70, 'el')).toBe('Σι♭')
    expect(pitchClassName(-1, 'en')).toBe('B')
  })

  it('reads engine pitch names, sharps and flats', () => {
    expect(pcOf('Eb')).toBe(3)
    expect(pcOf('D#')).toBe(3)
    expect(pcOf('F#')).toBe(6)
    expect(() => pcOf('H')).toThrow()
  })

  it('builds chord tones from root and quality', () => {
    expect(chordTones('A', 'min')).toEqual([9, 0, 4])
    expect(chordTones('G', '7')).toEqual([7, 11, 2, 5])
  })

  it('long chord and key names', () => {
    expect(chordLongName('A', 'min', 'el')).toBe('Λα ελάσσονα')
    expect(chordLongName('A', 'min', 'en')).toBe('A minor')
    expect(chordLongName('G', '7', 'en')).toBe('G dominant 7th')
    expect(keyName('F#', 'major', 'el')).toBe('Φα♯ μείζονα')
    expect(keyName('A', 'minor', 'en')).toBe('A minor')
  })

  it('fingering for triads and sevenths', () => {
    expect(fingeringFor(3)).toBe('5 3 1')
    expect(fingeringFor(4)).toBe('5 3 2 1')
  })
})
