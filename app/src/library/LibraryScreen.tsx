import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLang, useMessages } from '../i18n/lang'
import { keyName } from '../i18n/music'
import { SongLoadError, loadIndex, type SongLoadErrorCode } from '../song/loader'
import type { SongSummary } from '../song/types'
import { formatTime } from '../player/timeline'
import { Plus } from '../ui/icons'

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

export function LibraryScreen() {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const [state, setState] = useState<{ songs?: SongSummary[]; error?: SongLoadErrorCode }>({})

  useEffect(() => {
    let alive = true
    loadIndex().then(
      (songs) => alive && setState({ songs }),
      (e: unknown) => alive && setState({ error: e instanceof SongLoadError ? e.code : 'network' }),
    )
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="library">
      <header className="lib-header">
        <span className="logo" aria-hidden="true"><span className="l1" /><span className="l2" /><span className="l3" /></span>
        <h1 className="wordmark">Pianoverse</h1>
        <div className="segmented small" role="group" aria-label={m.library.language}>
          <button type="button" aria-pressed={lang === 'el'} onClick={() => setLang('el')}>ΕΛ</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        </div>
      </header>
      <h2 className="section-label">{m.library.yourSongs}</h2>
      {state.error && <p className="lib-note">{m.errors[state.error]}</p>}
      {state.songs?.length === 0 && <p className="lib-note">{m.library.empty}</p>}
      <ul className="song-list">
        {state.songs?.map((song) => <li key={song.id}><SongCard song={song} /></li>)}
      </ul>
      <div className="new-song-soon"><Plus />{m.library.newSongSoon}</div>
    </div>
  )
}
