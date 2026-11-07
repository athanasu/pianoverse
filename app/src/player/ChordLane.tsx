import { useMessages } from '../i18n/lang'
import type { ChordSegment } from '../song/types'
import { useClockTime } from './hooks'
import { chordAt, chordRemaining, upcomingChords } from './timeline'
import type { PlaybackClock } from './transport'

export function ChordLane({ clock, chords }: { clock: PlaybackClock; chords: ChordSegment[] }) {
  const m = useMessages()
  const t = useClockTime(clock)
  const current = chordAt(chords, t)
  const next = upcomingChords(chords, t, 3)
  return (
    <div className="chord-lane">
      <span className="lane-label">{m.player.now}</span>
      <span className="chord-pill current">
        {current?.symbol ?? '—'}
        {current && <span className="chord-bar" style={{ width: `${chordRemaining(current, t) * 100}%` }} />}
      </span>
      {next.length > 0 && <span className="lane-arrow" aria-hidden="true">→</span>}
      {next.map((c, i) => (
        <span key={c.start} className={i === 0 ? 'chord-pill next' : 'chord-pill later'}>{c.symbol}</span>
      ))}
    </div>
  )
}
