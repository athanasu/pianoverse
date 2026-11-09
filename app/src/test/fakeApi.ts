import { vi } from 'vitest'
import type { Api } from '../api/client'
import type { Job } from '../api/types'

export function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    listSongs: vi.fn(async () => []),
    getSong: vi.fn(async () => ({})),
    listJobs: vi.fn(async () => []),
    getJob: vi.fn(async (): Promise<Job> => {
      throw new Error('getJob not stubbed')
    }),
    createJob: vi.fn(async () => 'j1'),
    dismissJob: vi.fn(async () => {}),
    ...overrides,
  }
}
