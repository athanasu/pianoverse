import type { JobStatus } from '../api/types'

export type StepId = 'separating' | 'analyzing' | 'melody' | 'arranging'
export type StepState = 'done' | 'active' | 'pending'

export const STEPS: StepId[] = ['separating', 'analyzing', 'melody', 'arranging']

export function stepStates(status: JobStatus): { id: StepId; state: StepState }[] {
  const current = status === 'done' ? STEPS.length : status === 'queued' || status === 'failed' ? -1 : STEPS.indexOf(status)
  return STEPS.map((id, i) => ({ id, state: i < current ? 'done' : i === current ? 'active' : 'pending' }))
}
