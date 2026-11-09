import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, type Api } from '../api/client'
import type { CreateJobInput } from '../api/types'

export type SubmitState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'error'; code: string; message?: string }

export function useSubmit(api: Api) {
  const navigate = useNavigate()
  const [state, setState] = useState<SubmitState>({ status: 'idle' })

  const send = async (input: CreateJobInput) => {
    setState({ status: 'sending' })
    try {
      const jobId = await api.createJob(input)
      navigate(`/processing/${encodeURIComponent(jobId)}`)
    } catch (e) {
      setState(e instanceof ApiError ? { status: 'error', code: e.code, message: e.serverMessage } : { status: 'error', code: 'internal' })
    }
  }
  const clear = () => setState({ status: 'idle' })

  return { state, send, clear }
}
