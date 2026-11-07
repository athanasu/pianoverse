import type { Lang } from './messages'

const NAMES: Record<Lang, string[]> = {
  el: ['Ντο', 'Ντο♯', 'Ρε', 'Μι♭', 'Μι', 'Φα', 'Φα♯', 'Σολ', 'Λα♭', 'Λα', 'Σι♭', 'Σι'],
  en: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
}

const PC: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
}

export const QUALITY_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8],
}

const QUALITY_LONG: Record<Lang, Record<string, string>> = {
  el: {
    maj: 'μείζονα', min: 'ελάσσονα', '7': 'με 7η', maj7: 'μείζονα με μεγάλη 7η', m7: 'ελάσσονα με 7η',
    sus2: 'sus2', sus4: 'sus4', dim: 'ελαττωμένη', aug: 'αυξημένη',
  },
  en: {
    maj: 'major', min: 'minor', '7': 'dominant 7th', maj7: 'major 7th', m7: 'minor 7th',
    sus2: 'suspended 2nd', sus4: 'suspended 4th', dim: 'diminished', aug: 'augmented',
  },
}

export function pcOf(name: string): number {
  const pc = PC[name]
  if (pc === undefined) throw new Error(`unknown pitch name: ${name}`)
  return pc
}

export function pitchClassName(pc: number, lang: Lang): string {
  return NAMES[lang][((pc % 12) + 12) % 12]
}

export function noteName(midi: number, lang: Lang): string {
  return pitchClassName(midi, lang)
}

export function chordTones(root: string, quality: string): number[] {
  const intervals = QUALITY_INTERVALS[quality] ?? QUALITY_INTERVALS.maj
  const r = pcOf(root)
  return intervals.map((i) => (r + i) % 12)
}

export function chordLongName(root: string, quality: string, lang: Lang): string {
  return `${pitchClassName(pcOf(root), lang)} ${QUALITY_LONG[lang][quality] ?? quality}`
}

export function keyName(tonic: string, mode: 'major' | 'minor', lang: Lang): string {
  const word = lang === 'el' ? (mode === 'major' ? 'μείζονα' : 'ελάσσονα') : mode
  return `${pitchClassName(pcOf(tonic), lang)} ${word}`
}

export function fingeringFor(toneCount: number): string {
  return toneCount >= 4 ? '5 3 2 1' : '5 3 1'
}
