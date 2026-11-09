import type { Key, SourceType } from '../song/types'

export type JobStatus = 'queued' | 'separating' | 'analyzing' | 'melody' | 'arranging' | 'done' | 'failed'
export type ActiveJobStatus = Exclude<JobStatus, 'done' | 'failed'>
export type JobSource = 'recording' | 'file'
export type Mode = 'auto' | SourceType
export type ApiErrorCode = string

export const MODES: Mode[] = ['auto', 'vocal', 'instrumental', 'solo_piano']

export interface JobPreview {
  key: Key
  bpm: number
  timeSignature: [number, number]
  chords: string[]
}

export interface Job {
  id: string
  title: string
  status: JobStatus
  progress: number
  source: JobSource
  durationSec: number
  createdAt: string
  songId?: string
  preview?: JobPreview
  error?: { code: ApiErrorCode; message: string }
}

export interface CreateJobInput {
  audio: Blob
  filename: string
  title: string
  mode: Mode
  source: JobSource
}
