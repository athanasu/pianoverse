import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, getApi } from '../api/client'
import type { Job } from '../api/types'
import { usePoll } from '../api/usePoll'
import { useLang, useMessages } from '../i18n/lang'
import { keyName } from '../i18n/music'
import { SongLoadError, loadIndex, type SongLoadErrorCode } from '../song/loader'
import type { SongSummary } from '../song/types'
import { formatTime } from '../player/timeline'
import { handOff } from '../newsong/handoff'
import { DropOverlay } from '../ui/DropOverlay'
import { Alert, Mic, Upload } from '../ui/icons'
import { useFileDrop } from '../ui/useFileDrop'
import { FailedJobCard, JobCard } from './JobCards'

export const JOBS_POLL_MS = 2000

function Thumb({ seed }: { seed: string }) {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997
  return (
    <span className="thumb-roll" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const height = 10 + ((h * (i + 3)) % 22)
        const top = 6 + ((h * (i + 1) * 5) % (44 - height))
        return <span key={i} className={i % 2 === 0 ? 'bar left' : 'bar right'} style={{ left: 4 + i * 10, top, height }} />
      })}
    </span>
  )
}

function SongCard({ song }: { song: SongSummary }) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  return (
    <Link to={`/song/${encodeURIComponent(song.id)}`} className="song-card">
      <Thumb seed={song.id} />
      <span className="song-body">
        <span className="song-title">{song.title}</span>
        <span className="song-meta">{`${keyName(song.key.tonic, song.key.mode, lang)} · ${Math.round(song.bpm)} BPM · ${formatTime(song.durationSec)}`}</span>
        <span className="song-chords">
          {song.chords.slice(0, 4).map((c, i) => <span key={`${c}-${i}`} className="chip">{c}</span>)}
        </span>
      </span>
      <span className="song-tag">{m.library.sourceType[song.sourceType]}</span>
    </Link>
  )
}

/** The way in: record, browse for a file, or drop one anywhere on the page. */
function AddSong({ onFile }: { onFile: (file: File) => void }) {
  const m = useMessages()
  const inputId = useId()
  return (
    <section className="add-card">
      <h2 className="add-title">{m.library.addTitle}</h2>
      <p className="add-text">{m.library.addText}</p>
      <div className="add-actions">
        <Link to="/new" className="add-btn primary"><Mic />{m.newSong.record}</Link>
        <input
          id={inputId}
          className="sr-only"
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
        <label htmlFor={inputId} className="add-btn"><Upload />{m.newSong.file}</label>
      </div>
      <p className="add-drop">{m.library.addDrop}</p>
    </section>
  )
}

export function LibraryScreen() {
  const m = useMessages()
  const navigate = useNavigate()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const api = useMemo(() => getApi(), [])
  const jobs = usePoll(() => (api ? api.listJobs() : Promise.resolve<Job[]>([])), JOBS_POLL_MS, { enabled: api !== null })
  const [dismissed, setDismissed] = useState<string[]>([])
  const [reload, setReload] = useState(0)
  const [state, setState] = useState<{ songs?: SongSummary[]; error?: SongLoadErrorCode }>({})

  const visible = (jobs.data ?? []).filter((job) => !dismissed.includes(job.id))
  const active = visible.filter((job) => job.status !== 'failed' && job.status !== 'done')
  const failed = visible.filter((job) => job.status === 'failed')
  const activeKey = active.map((job) => job.id).join(',')

  // Reloads whenever the set of running jobs changes, so a finished job turns into a song card.
  useEffect(() => {
    let alive = true
    loadIndex().then(
      (songs) => alive && setState({ songs }),
      (e: unknown) => alive && setState({ error: e instanceof SongLoadError ? e.code : 'network' }),
    )
    return () => {
      alive = false
    }
  }, [activeKey, reload])

  const retry = () => {
    setReload((n) => n + 1)
    jobs.refresh()
  }
  const dismiss = (id: string) => {
    setDismissed((ids) => [...ids, id])
    // Hidden at once; if the DELETE fails the card simply comes back on the next visit.
    void api?.dismissJob(id).catch(() => undefined)
  }
  const addFile = (file: File) => {
    handOff(file)
    navigate('/new')
  }
  const dragging = useFileDrop(addFile, api !== null)
  const unauthorized = state.error === 'unauthorized' || (jobs.error instanceof ApiError && jobs.error.code === 'unauthorized')
  const serverDown = api !== null && state.error === 'network' && !unauthorized

  return (
    <div className="library">
      <header className="lib-header">
        <span className="logo" aria-hidden="true"><span className="l1" /><span className="l2" /><span className="l3" /></span>
        <h1 className="wordmark">Pianoverse</h1>
        <div className="segmented small" role="group" aria-label={m.library.language}>
          <button type="button" aria-pressed={lang === 'el'} onClick={() => setLang('el')}>{m.common.langLabels.el}</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>{m.common.langLabels.en}</button>
        </div>
      </header>
      {api ? <AddSong onFile={addFile} /> : <p className="demo-note"><Alert /><span>{m.library.demo}</span></p>}
      <h2 className="section-label">{m.library.yourSongs}</h2>
      {serverDown && (
        <div className="server-down" role="alert">
          <Alert />
          <span>{m.library.serverDown}</span>
          <button type="button" className="text-btn" onClick={retry}>{m.common.retry}</button>
        </div>
      )}
      {unauthorized && (
        <div className="server-down" role="alert">
          <Alert />
          <span>{m.apiErrors.unauthorized}</span>
          <button type="button" className="text-btn" onClick={retry}>{m.common.retry}</button>
        </div>
      )}
      {state.error && !serverDown && !unauthorized && <p className="lib-note">{m.errors[state.error]}</p>}
      {state.songs?.length === 0 && visible.length === 0 && <p className="lib-note">{m.library.empty}</p>}
      <ul className="song-list">
        {active.map((job) => <li key={job.id}><JobCard job={job} /></li>)}
        {failed.map((job) => <li key={job.id}><FailedJobCard job={job} onDismiss={() => dismiss(job.id)} /></li>)}
        {state.songs?.map((song) => <li key={song.id}><SongCard song={song} /></li>)}
      </ul>
      {dragging && <DropOverlay />}
    </div>
  )
}
