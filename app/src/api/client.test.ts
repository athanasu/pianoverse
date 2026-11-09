import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiConfig, createApi, getApi, type FetchLike } from './client'

const config = { url: 'http://api.test', key: 'k1' }
const respond = (body: unknown, status = 200) =>
  vi.fn<FetchLike>(async () => new Response(JSON.stringify(body), { status }))
const audio = new Blob(['RIFF'], { type: 'audio/wav' })
const input = { audio, filename: 'take.wav', title: 'Take', mode: 'instrumental' as const, source: 'file' as const }

afterEach(() => vi.unstubAllEnvs())

describe('apiConfig', () => {
  it('is off without a URL and trims a trailing slash', () => {
    expect(apiConfig({})).toBeNull()
    expect(apiConfig({ VITE_API_URL: '   ' })).toBeNull()
    expect(apiConfig({ VITE_API_URL: 'http://api.test/', VITE_API_KEY: 'k1' })).toEqual(config)
    expect(apiConfig({ VITE_API_URL: 'http://api.test' })).toEqual({ url: 'http://api.test', key: '' })
  })

  it('reads the Vite env by default', () => {
    expect(apiConfig()).toBeNull()
    expect(getApi()).toBeNull()
    vi.stubEnv('VITE_API_URL', 'http://api.test')
    expect(apiConfig()).toEqual({ url: 'http://api.test', key: '' })
    expect(getApi()).not.toBeNull()
  })
})

describe('createApi', () => {
  it('sends the key and reads songs, jobs and a song', async () => {
    const fetchImpl = respond([{ id: 's1' }])
    const api = createApi(config, fetchImpl)
    await expect(api.listSongs()).resolves.toEqual([{ id: 's1' }])
    await api.listJobs()
    await api.getJob('a b')
    await api.getSong('s1')
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'http://api.test/api/songs',
      'http://api.test/api/jobs?active=1',
      'http://api.test/api/jobs/a%20b',
      'http://api.test/api/songs/s1',
    ])
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({ Authorization: 'Bearer k1' })
  })

  it('sends no Authorization header without a key', async () => {
    const fetchImpl = respond([])
    await createApi({ url: 'http://api.test', key: '' }, fetchImpl).listSongs()
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({})
  })

  it('posts the audio as multipart and returns the job id', async () => {
    const fetchImpl = respond({ jobId: 'j1' }, 202)
    await expect(createApi(config, fetchImpl).createJob(input)).resolves.toBe('j1')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://api.test/api/jobs')
    expect(init?.method).toBe('POST')
    const body = init?.body as FormData
    expect(body.get('title')).toBe('Take')
    expect(body.get('mode')).toBe('instrumental')
    expect(body.get('source')).toBe('file')
    expect((body.get('audio') as File).name).toBe('take.wav')
  })

  it('dismisses a job with DELETE', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }))
    await createApi(config, fetchImpl).dismissJob('j2')
    expect(fetchImpl).toHaveBeenCalledWith('http://api.test/api/jobs/j2', expect.objectContaining({ method: 'DELETE' }))
  })

  it('turns error bodies, bare statuses, dead networks and garbage into ApiError', async () => {
    const rejected = createApi(config, respond({ error: { code: 'too_short', message: 'Too short.' } }, 400))
    await expect(rejected.createJob(input)).rejects.toMatchObject({ code: 'too_short', status: 400, serverMessage: 'Too short.' })

    const missing = createApi(config, vi.fn<FetchLike>(async () => new Response('nope', { status: 404 })))
    await expect(missing.getJob('x')).rejects.toMatchObject({ code: 'not_found', status: 404 })

    const down = createApi(config, vi.fn<FetchLike>(async () => { throw new TypeError('offline') }))
    const error = await down.listSongs().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'network', status: 0 })

    const garbled = createApi(config, vi.fn<FetchLike>(async () => new Response('<html>', { status: 200 })))
    await expect(garbled.listSongs()).rejects.toMatchObject({ code: 'bad_response' })

    const noId = createApi(config, respond({}, 202))
    await expect(noId.createJob(input)).rejects.toMatchObject({ code: 'bad_response' })
  })
})
