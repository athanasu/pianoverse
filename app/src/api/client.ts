import type { SongSummary } from '../song/types'
import type { CreateJobInput, Job } from './types'

export interface ApiConfig {
  url: string
  key: string
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function apiConfig(env: Record<string, unknown> = import.meta.env): ApiConfig | null {
  const url = text(env.VITE_API_URL).replace(/\/+$/, '')
  return url ? { url, key: text(env.VITE_API_KEY) } : null
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly serverMessage: string | undefined

  constructor(code: string, status: number, serverMessage?: string) {
    super(serverMessage ?? code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.serverMessage = serverMessage
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface Api {
  listSongs(): Promise<SongSummary[]>
  getSong(id: string): Promise<unknown>
  listJobs(): Promise<Job[]>
  getJob(id: string): Promise<Job>
  createJob(input: CreateJobInput): Promise<string>
  dismissJob(id: string): Promise<void>
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } }
    const { code, message } = body.error ?? {}
    if (typeof code === 'string') return new ApiError(code, res.status, typeof message === 'string' ? message : undefined)
  } catch {
    // not our JSON error shape: fall back to the status
  }
  return new ApiError(res.status === 404 ? 'not_found' : `http_${res.status}`, res.status)
}

// The default looks up the global fetch per call, so test stubs installed later still apply.
export function createApi(config: ApiConfig, fetchImpl: FetchLike = (input, init) => fetch(input, init)): Api {
  const headers: Record<string, string> = config.key ? { Authorization: `Bearer ${config.key}` } : {}

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response
    try {
      res = await fetchImpl(`${config.url}/api${path}`, { ...init, headers })
    } catch {
      throw new ApiError('network', 0)
    }
    if (!res.ok) throw await toError(res)
    return res
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await send(path, init)
    try {
      return (await res.json()) as T
    } catch {
      throw new ApiError('bad_response', res.status)
    }
  }

  const id = encodeURIComponent
  return {
    listSongs: () => json<SongSummary[]>('/songs'),
    getSong: (songId) => json<unknown>(`/songs/${id(songId)}`),
    listJobs: () => json<Job[]>('/jobs?active=1'),
    getJob: (jobId) => json<Job>(`/jobs/${id(jobId)}`),
    async createJob(input) {
      const body = new FormData()
      body.append('audio', input.audio, input.filename)
      body.append('title', input.title)
      body.append('mode', input.mode)
      body.append('source', input.source)
      const res = await json<{ jobId?: unknown }>('/jobs', { method: 'POST', body })
      if (typeof res.jobId !== 'string') throw new ApiError('bad_response', 202)
      return res.jobId
    },
    async dismissJob(jobId) {
      await send(`/jobs/${id(jobId)}`, { method: 'DELETE' })
    },
  }
}

export function getApi(fetchImpl?: FetchLike): Api | null {
  const config = apiConfig()
  return config ? createApi(config, fetchImpl) : null
}
