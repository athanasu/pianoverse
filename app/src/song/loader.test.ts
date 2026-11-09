import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, apiFetch, jsonResponse } from '../test/apiFetch'
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

describe('with the backend configured', () => {
  beforeEach(() => vi.stubEnv('VITE_API_URL', API_URL))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reads songs and the index from the API', async () => {
    const fetchMock = apiFetch({
      'GET /api/songs': () => jsonResponse([{ id: 'demo' }]),
      'GET /api/songs/demo': () => jsonResponse(demo),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadSong('demo')).resolves.toMatchObject({ id: 'demo' })
    await expect(loadIndex()).resolves.toEqual([{ id: 'demo' }])
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/songs/demo`, expect.anything())
  })

  it('maps API failures to song load codes', async () => {
    vi.stubGlobal('fetch', apiFetch({ 'GET /api/songs/x': () => jsonResponse({ error: { code: 'not_found', message: 'Not found.' } }, 404) }))
    await expect(loadSong('x')).rejects.toMatchObject({ code: 'not_found' })
    vi.stubGlobal('fetch', apiFetch({ 'GET /api/songs': () => jsonResponse({ error: { code: 'unauthorized', message: 'no' } }, 401) }))
    await expect(loadIndex()).rejects.toMatchObject({ code: 'unauthorized' })
    vi.stubGlobal('fetch', apiFetch({}))
    await expect(loadIndex()).rejects.toMatchObject({ code: 'network' })
    vi.stubGlobal('fetch', apiFetch({ 'GET /api/songs': () => new Response('<html>', { status: 200 }) }))
    await expect(loadIndex()).rejects.toMatchObject({ code: 'schema_mismatch' })
  })
})
