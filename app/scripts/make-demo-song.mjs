// Writes a small, copyright-free demo song (Am F C G, twice) in the engine's Song JSON format.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'songs')
const BPM = 90
const BEAT = 60 / BPM
const CHORDS = [
  { symbol: 'Am', root: 'A', quality: 'min', triad: [45, 48, 52], bass: 45 },
  { symbol: 'F', root: 'F', quality: 'maj', triad: [45, 48, 53], bass: 53 },
  { symbol: 'C', root: 'C', quality: 'maj', triad: [48, 52, 55], bass: 48 },
  { symbol: 'G', root: 'G', quality: 'maj', triad: [47, 50, 55], bass: 55 },
]
// [midi pitch, start beat, length in beats] over one 16-beat pass
const MELODY = [
  [76, 0, 1], [72, 1, 1], [74, 2, 0.5], [76, 2.5, 1.5], [77, 4, 1], [76, 5, 1], [72, 6, 2],
  [79, 8, 1.5], [76, 9.5, 0.5], [74, 10, 1], [72, 11, 1], [74, 12, 1], [71, 13, 1], [74, 14, 2],
]
const r3 = (x) => Math.round(x * 1000) / 1000
const note = (pitch, startBeat, beats, hand, velocity) => ({
  pitch, start: r3(startBeat * BEAT), end: r3((startBeat + beats) * BEAT - 0.02), velocity, hand,
})

function arrangement(level) {
  const notes = []
  for (const offset of [0, 16]) {
    const melody = MELODY.filter((m) => !(level === 'easy' && m[2] === 0.5))
    melody.forEach(([pitch, start, length], i) => {
      const next = melody[i + 1]
      const len = level === 'easy' ? (next ? next[1] : 16) - start : length
      notes.push(note(pitch, offset + start, len, 'R', 80))
    })
    CHORDS.forEach((c, i) => {
      const start = offset + i * 4
      if (level === 'easy') notes.push(note(c.bass, start, 4, 'L', 60))
      else if (level === 'medium') c.triad.forEach((p) => notes.push(note(p, start, 4, 'L', 60)))
      else {
        const pattern = [c.triad[0], c.triad[1], c.triad[2], c.triad[1]]
        for (let k = 0; k < 8; k++) notes.push(note(pattern[k % 4], start + k * 0.5, 0.5, 'L', 58))
      }
    })
  }
  return { notes: notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch) }
}

const totalBeats = 32
const beats = Array.from({ length: totalBeats }, (_, i) => r3(i * BEAT))
const song = {
  schemaVersion: 1,
  id: 'demo',
  title: 'Demo · Am F C G',
  durationSec: r3(totalBeats * BEAT + 1),
  sourceType: 'instrumental',
  tempo: { bpm: BPM, beats, downbeats: beats.filter((_, i) => i % 4 === 0) },
  timeSignature: [4, 4],
  key: { tonic: 'A', mode: 'minor' },
  chords: Array.from({ length: 8 }, (_, i) => {
    const c = CHORDS[i % 4]
    return { start: r3(i * 4 * BEAT), end: r3((i + 1) * 4 * BEAT), symbol: c.symbol, root: c.root, quality: c.quality }
  }),
  arrangements: { easy: arrangement('easy'), medium: arrangement('medium'), hard: arrangement('hard') },
  warnings: [],
}

mkdirSync(join(OUT, 'demo'), { recursive: true })
writeFileSync(join(OUT, 'demo', 'song.json'), JSON.stringify(song, null, 2) + '\n')
const summary = {
  id: song.id, title: song.title, key: song.key, bpm: song.tempo.bpm,
  durationSec: song.durationSec, sourceType: song.sourceType, chords: ['Am', 'F', 'C', 'G'],
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify([summary], null, 2) + '\n')
console.log('wrote', join(OUT, 'demo', 'song.json'))
