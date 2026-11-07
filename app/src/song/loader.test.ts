import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SongLoadError, loadIndex, loadSong, parseSong, songUrl } from './loader'
import { availableLevels } from './types'

const demo = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../public/songs/demo/song.json'), 'utf-8'),
)
const respond = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('parseSong', () => {
  it('accepts the demo song and lists its levels', () => {
    const song = parseSong(demo)
    expect(song.title).toBe('Demo · Am F C G')
    expect(availableLevels(song)).toEqual(['easy', 'medium', 'hard'])
  })

  it('rejects other schema versions and malformed data', () => {
    expect(() => parseSong({ ...demo, schemaVersion: 2 })).toThrow(SongLoadError)
    expect(() => parseSong({ schemaVersion: 1 })).toThrow(SongLoadError)
    expect(() => parseSong('nope')).toThrow(SongLoadError)
    try {
      parseSong({ ...demo, schemaVersion: 2 })
    } catch (e) {
      expect((e as SongLoadError).code).toBe('schema_mismatch')
    }
  })

  it('fills in missing warnings', () => {
    const { warnings: _omit, ...rest } = demo
    expect(parseSong(rest).warnings).toEqual([])
  })
})

describe('loadSong / loadIndex', () => {
  it('fetches by id', async () => {
    const fetchImpl = respond(demo)
    await expect(loadSong('demo', fetchImpl)).resolves.toMatchObject({ id: 'demo' })
    expect(fetchImpl).toHaveBeenCalledWith(songUrl('demo'))
    expect(songUrl('a b')).toBe('/songs/a%20b/song.json')
  })

  it('maps HTTP and network failures to codes', async () => {
    await expect(loadSong('x', respond({}, 404))).rejects.toMatchObject({ code: 'not_found' })
    await expect(loadSong('x', respond({}, 500))).rejects.toMatchObject({ code: 'network' })
    await expect(loadSong('x', vi.fn().mockRejectedValue(new TypeError('offline')))).rejects.toMatchObject({ code: 'network' })
  })

  it('loads the index', async () => {
    const songs = await loadIndex(respond([{ id: 'demo', title: 'Demo' }]))
    expect(songs[0].id).toBe('demo')
    await expect(loadIndex(respond({ not: 'a list' }))).rejects.toMatchObject({ code: 'schema_mismatch' })
  })
})
