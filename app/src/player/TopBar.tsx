import { Link } from 'react-router'
import { useLang, useMessages } from '../i18n/lang'
import { keyName } from '../i18n/music'
import type { Level, Song } from '../song/types'
import { Alert, ChevronLeft, Keys } from '../ui/icons'
import { usePlayer } from './store'

export function TopBar({ song, levels }: { song: Song; levels: Level[] }) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  const level = usePlayer((s) => s.level)
  const setLevel = usePlayer((s) => s.setLevel)
  const card = usePlayer((s) => s.card)
  const toggleCard = usePlayer((s) => s.toggleCard)
  const uncertain = song.warnings.filter((w) => w.code === 'chords_uncertain').length
  const [beatsPerBar, beatUnit] = song.timeSignature

  return (
    <header className="topbar">
      <Link to="/" className="icon-btn" aria-label={m.common.back}><ChevronLeft /></Link>
      <div className="topbar-title">
        <div className="title">{song.title}</div>
        <div className="subtitle">{`${keyName(song.key.tonic, song.key.mode, lang)} · ${Math.round(song.tempo.bpm)} BPM · ${beatsPerBar}/${beatUnit}`}</div>
      </div>
      {uncertain > 0 && <div className="warn-chip"><Alert />{m.player.uncertain(uncertain)}</div>}
      <div className="segmented" role="group" aria-label={m.player.levelGroup}>
        {levels.map((l) => (
          <button key={l} type="button" aria-pressed={l === level} onClick={() => setLevel(l)}>{m.player.levels[l]}</button>
        ))}
      </div>
      <button type="button" className="icon-btn outlined" aria-pressed={card} aria-label={m.player.chordCard} onClick={toggleCard}><Keys /></button>
    </header>
  )
}
