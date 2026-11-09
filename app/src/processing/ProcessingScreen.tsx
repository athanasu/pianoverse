import { useEffect, useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ApiError, getApi, type Api } from '../api/client'
import { errorText } from '../api/errorText'
import type { Job } from '../api/types'
import { usePoll } from '../api/usePoll'
import { useMessages } from '../i18n/lang'
import { formatTime } from '../player/timeline'
import { ChevronLeft } from '../ui/icons'
import { FoundSoFar } from './FoundSoFar'
import { GhostRoll } from './GhostRoll'
import { StepList } from './StepList'

export const POLL_MS = 2000

const isUnauthorized = (e: unknown) => e instanceof ApiError && e.code === 'unauthorized'
const finished = (job: Job | null) => job === null || job.status === 'done' || job.status === 'failed'

export function Processing({ api, jobId }: { api: Api; jobId: string }) {
  const m = useMessages()
  const navigate = useNavigate()
  // A 404 resolves to null and a 401 stops polling; every other error keeps retrying.
  const poll = usePoll(
    () =>
      api.getJob(jobId).catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'not_found') return null
        throw e
      }),
    POLL_MS,
    { stop: finished, stopOnError: isUnauthorized },
  )
  const job = poll.data

  useEffect(() => {
    if (job?.status === 'done' && job.songId) navigate(`/song/${encodeURIComponent(job.songId)}`, { replace: true })
  }, [job, navigate])

  if (isUnauthorized(poll.error)) {
    return (
      <div className="player-message">
        <p>{errorText(m, 'unauthorized')}</p>
        <Link to="/" className="pill-link"><ChevronLeft />{m.common.back}</Link>
      </div>
    )
  }

  if (job === null) {
    return (
      <div className="player-message">
        <p>{errorText(m, 'not_found')}</p>
        <Link to="/" className="pill-link"><ChevronLeft />{m.common.back}</Link>
      </div>
    )
  }

  const failed = job?.status === 'failed'
  return (
    <div className="screen processing">
      <header className="proc-head">
        <Link to="/" className="icon-btn" aria-label={m.common.back}><ChevronLeft /></Link>
      </header>
      <div className="proc-intro">
        <p className="kicker">{job ? `${m.processing.source[job.source]} · ${formatTime(job.durationSec)}` : ' '}</p>
        <h1 className="proc-title">{failed ? m.processing.failedTitle : m.processing.title}</h1>
        {job && <p className="proc-sub">{job.title}</p>}
      </div>
      <GhostRoll progress={job?.progress ?? 0} />
      {job && failed ? (
        <div className="form-error" role="alert">
          <p>{errorText(m, job.error?.code ?? 'internal', job.error?.message)}</p>
        </div>
      ) : (
        <>
          <StepList status={job?.status ?? 'queued'} preview={job?.preview} />
          {job?.status === 'queued' && <p className="proc-note">{m.processing.queued}</p>}
          {job?.preview && <FoundSoFar preview={job.preview} />}
        </>
      )}
      {poll.error !== undefined && <p className="proc-note" role="status">{m.processing.reconnecting}</p>}
      {failed ? (
        <Link to="/new" className="cta">{m.common.retry}</Link>
      ) : (
        <Link to="/" className="ghost-cta">{m.processing.background}</Link>
      )}
    </div>
  )
}

export function ProcessingScreen() {
  const { jobId = '' } = useParams()
  const api = useMemo(() => getApi(), [])
  return api && jobId ? <Processing key={jobId} api={api} jobId={jobId} /> : <Navigate to="/" replace />
}
