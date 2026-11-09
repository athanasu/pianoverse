import { Link } from 'react-router'
import { errorText } from '../api/errorText'
import type { ActiveJobStatus, Job } from '../api/types'
import { useMessages } from '../i18n/lang'
import { Alert } from '../ui/icons'

export function JobCard({ job }: { job: Job }) {
  const m = useMessages()
  const stage: ActiveJobStatus = job.status === 'done' || job.status === 'failed' ? 'arranging' : job.status
  const width = `${Math.round(Math.min(1, Math.max(0.04, job.progress)) * 100)}%`
  return (
    <Link to={`/processing/${encodeURIComponent(job.id)}`} className="song-card job-card">
      <span className="job-thumb" aria-hidden="true"><span /><span /><span /></span>
      <span className="song-body">
        <span className="song-title">{job.title}</span>
        <span className="song-meta">{m.library.processingCard[stage]}</span>
        <span className="job-bar" aria-hidden="true"><span style={{ width }} /></span>
      </span>
    </Link>
  )
}

export function FailedJobCard({ job, onDismiss }: { job: Job; onDismiss: () => void }) {
  const m = useMessages()
  return (
    <div className="song-card job-card">
      <span className="job-thumb failed" aria-hidden="true"><Alert /></span>
      <span className="song-body">
        <span className="song-title">{job.title}</span>
        <span className="job-error">{errorText(m, job.error?.code ?? 'internal', job.error?.message)}</span>
      </span>
      <button type="button" className="text-btn" onClick={onDismiss}>{m.library.dismiss}</button>
    </div>
  )
}
