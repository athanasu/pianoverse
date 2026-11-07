import { Link } from 'react-router'
import { useLang, useMessages } from '../i18n/lang'
import { keyName } from '../i18n/music'
import type { Messages } from '../i18n/messages'
import type { Level, Song, SongWarning } from '../song/types'
import { Alert, ChevronLeft, Keys } from '../ui/icons'
import { usePlayer } from './store'

function warningChips(warnings: SongWarning[], texts: Messages['warnings']): { code: string; text: string }[] {
  const byCode = new Map<string, { count: number; message: string }>()
  for (const w of warnings) {
    const seen = byCode.get(w.code)
    if (seen) seen.count++
    else byCode.set(w.code, { count: 1, message: w.message })
  }
  const known: Partial<Record<string, (n: number) => string>> = texts
  return [...byCode].map(([code, { count, message }]) => ({
    code,
    text: Object.hasOwn(known, code) ? known[code]!(count) : message,
  }))
}

export function TopBar({ song, levels }: { song: Song; levels: Level[] }) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  const level = usePlayer((s) => s.level)
  const setLevel = usePlayer((s) => s.setLevel)
  const card = usePlayer((s) => s.card)
  const toggleCard = usePlayer((s) => s.toggleCard)
  const chips = warningChips(song.warnings, m.warnings)
  const [beatsPerBar, beatUnit] = song.timeSignature

  return (
    <header className="topbar">
      <Link to="/" className="icon-btn" aria-label={m.common.back}><ChevronLeft /></Link>
      <div className="topbar-title">
        <div className="title">{song.title}</div>
        <div className="subtitle">{`${keyName(song.key.tonic, song.key.mode, lang)} · ${Math.round(song.tempo.bpm)} BPM · ${beatsPerBar}/${beatUnit}`}</div>
      </div>
      {chips.map(({ code, text }) => (
        <div key={code} className="warn-chip" title={text}><Alert /><span className="warn-text">{text}</span></div>
      ))}
      <div className="segmented" role="group" aria-label={m.player.levelGroup}>
        {levels.map((l) => (
          <button key={l} type="button" aria-pressed={l === level} onClick={() => setLevel(l)}>{m.player.levels[l]}</button>
        ))}
      </div>
      <button type="button" className="icon-btn outlined" aria-pressed={card} aria-label={m.player.chordCard} onClick={toggleCard}><Keys /></button>
    </header>
  )
}
