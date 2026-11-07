import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// If this fails, schema/song.schema.json changed: update src/song/types.ts to match, then these lists.
const EXPECTED: Record<string, string[]> = {
  Song: ['arrangements', 'chords', 'durationSec', 'id', 'key', 'schemaVersion', 'sourceType', 'tempo', 'timeSignature', 'title', 'warnings'],
  Note: ['end', 'hand', 'pitch', 'start', 'velocity'],
  Arrangement: ['notes'],
  Tempo: ['beats', 'bpm', 'downbeats'],
  Key: ['mode', 'tonic'],
  ChordSegment: ['bass', 'end', 'quality', 'root', 'start', 'symbol'],
  SongWarning: ['code', 'end', 'message', 'start'],
}

describe('song types stay in sync with schema/song.schema.json', () => {
  const schema = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../../schema/song.schema.json'), 'utf-8'),
  )
  it('Song top-level fields', () => {
    expect(Object.keys(schema.properties).sort()).toEqual(EXPECTED.Song)
  })
  it.each(Object.keys(EXPECTED).filter((k) => k !== 'Song'))('%s fields', (name) => {
    expect(Object.keys(schema.$defs[name].properties).sort()).toEqual(EXPECTED[name])
  })
})
