import { useLang, useMessages } from '../i18n/lang'
import { chordLongName, chordTones, fingeringFor, pitchClassName } from '../i18n/music'
import type { ChordSegment } from '../song/types'
import { useClockTime } from './hooks'
import { chordAt, upcomingChords } from './timeline'
import type { PlaybackClock } from './transport'

const WHITE = [0, 2, 4, 5, 7, 9, 11]
const BLACK: [number, number][] = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]]

function MiniKeyboard({ tones }: { tones: number[] }) {
  return (
    <div className="mini-kb" aria-hidden="true">
      {WHITE.map((pc, i) => (
        <span key={pc} className={tones.includes(pc) ? 'mk-white on' : 'mk-white'} style={{ left: i * 24 }} />
      ))}
      {BLACK.map(([pc, after]) => (
        <span key={pc} className={tones.includes(pc) ? 'mk-black on' : 'mk-black'} style={{ left: (after + 1) * 24 - 7 }} />
      ))}
    </div>
  )
}

export function ChordCard({ clock, chords }: { clock: PlaybackClock; chords: ChordSegment[] }) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  const t = useClockTime(clock, 150)
  const chord = chordAt(chords, t) ?? upcomingChords(chords, t, 1)[0]
  if (!chord) return null
  const tones = chordTones(chord.root, chord.quality)
  return (
    <aside className="chord-card" aria-live="polite">
      <div className="cc-head">
        <span className="cc-symbol">{chord.symbol}</span>
        <span className="cc-long">{chordLongName(chord.root, chord.quality, lang)}</span>
      </div>
      <MiniKeyboard tones={tones} />
      <div className="cc-foot">
        <span>{tones.map((pc) => pitchClassName(pc, lang)).join(' · ')}</span>
        <span className="cc-fingers">{`${m.player.fingers} ${fingeringFor(tones.length)}`}</span>
      </div>
    </aside>
  )
}
