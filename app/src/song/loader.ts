import type { Song, SongSummary } from './types'

export type SongLoadErrorCode = 'network' | 'not_found' | 'schema_mismatch'

export class SongLoadError extends Error {
  readonly code: SongLoadErrorCode

  constructor(code: SongLoadErrorCode) {
    super(code)
    this.name = 'SongLoadError'
    this.code = code
  }
}

type FetchLike = (url: string) => Promise<Response>

const REQUIRED = ['id', 'title', 'durationSec', 'sourceType', 'tempo', 'timeSignature', 'key', 'chords', 'arrangements']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseSong(data: unknown): Song {
  if (!isObject(data) || data.schemaVersion !== 1) throw new SongLoadError('schema_mismatch')
  if (REQUIRED.some((k) => !(k in data))) throw new SongLoadError('schema_mismatch')
  if (!Array.isArray(data.chords) || !isObject(data.arrangements) || !isObject(data.tempo)) {
    throw new SongLoadError('schema_mismatch')
  }
  return { warnings: [], ...data } as unknown as Song
}

export function songUrl(id: string): string {
  return `/songs/${encodeURIComponent(id)}/song.json`
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  let res: Response
  try {
    res = await fetchImpl(url)
  } catch {
    throw new SongLoadError('network')
  }
  if (res.status === 404) throw new SongLoadError('not_found')
  if (!res.ok) throw new SongLoadError('network')
  try {
    return await res.json()
  } catch {
    throw new SongLoadError('schema_mismatch')
  }
}

export async function loadSong(id: string, fetchImpl: FetchLike = (u) => fetch(u)): Promise<Song> {
  return parseSong(await getJson(songUrl(id), fetchImpl))
}

export async function loadIndex(fetchImpl: FetchLike = (u) => fetch(u)): Promise<SongSummary[]> {
  const data = await getJson('/songs/index.json', fetchImpl)
  if (!Array.isArray(data)) throw new SongLoadError('schema_mismatch')
  return data as SongSummary[]
}
