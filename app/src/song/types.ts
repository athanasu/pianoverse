export type Hand = 'L' | 'R'
export type Level = 'easy' | 'medium' | 'hard' | 'original'
export type SourceType = 'vocal' | 'instrumental' | 'solo_piano'

export interface Note { pitch: number; start: number; end: number; velocity: number; hand: Hand }
export interface Arrangement { notes: Note[] }
export interface Tempo { bpm: number; beats: number[]; downbeats: number[] }
export interface Key { tonic: string; mode: 'major' | 'minor' }
export interface ChordSegment { start: number; end: number; symbol: string; root: string; quality: string; bass?: string | null }
export interface SongWarning { code: string; message: string; start?: number | null; end?: number | null }

export interface Song {
  schemaVersion: 1
  id: string
  title: string
  durationSec: number
  sourceType: SourceType
  tempo: Tempo
  timeSignature: [number, number]
  key: Key
  chords: ChordSegment[]
  arrangements: Partial<Record<Level, Arrangement>>
  warnings: SongWarning[]
}

export interface SongSummary {
  id: string
  title: string
  key: Key
  bpm: number
  durationSec: number
  sourceType: SourceType
  chords: string[]
}

export const LEVELS: Level[] = ['easy', 'medium', 'hard', 'original']

export function availableLevels(song: Song): Level[] {
  return LEVELS.filter((level) => (song.arrangements[level]?.notes.length ?? 0) > 0)
}
