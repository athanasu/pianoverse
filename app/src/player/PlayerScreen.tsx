import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { useLang, useMessages } from '../i18n/lang'
import { SongLoadError, loadSong, type SongLoadErrorCode } from '../song/loader'
import { availableLevels, type Song } from '../song/types'
import { ChevronLeft } from '../ui/icons'
import { ChordCard } from './ChordCard'
import { ChordLane } from './ChordLane'
import { Controls } from './Controls'
import { useClockPlaying, usePiano, useWakeLock } from './hooks'
import { keyboardRange } from './keyboard'
import { PianoRoll } from './PianoRoll'
import { usePlayer } from './store'
import { TopBar } from './TopBar'
import { TransportClock } from './transport'

function Player({ song }: { song: Song }) {
  const m = useMessages()
  const clock = useMemo(() => new TransportClock(song.durationSec), [song])
  const levels = useMemo(() => availableLevels(song), [song])

  const { level, speed, loop, card } = usePlayer(useShallow((s) => ({ level: s.level, speed: s.speed, loop: s.loop, card: s.card })))
  const notes = song.arrangements[level]?.notes ?? []
  const notesRef = useRef(notes)
  notesRef.current = notes

  const [lo, hi] = useMemo(
    () => keyboardRange(Object.values(song.arrangements).flatMap((a) => a?.notes.map((n) => n.pitch) ?? [])),
    [song],
  )
  useEffect(() => clock.setRate(speed), [clock, speed])
  useEffect(() => clock.setLoop(loop), [clock, loop])

  const playing = useClockPlaying(clock)
  const piano = usePiano(clock, notesRef)
  useWakeLock(playing)

  const togglePlay = () => {
    void piano.ensure()
    if (clock.isPlaying()) clock.pause()
    else clock.play()
  }
  const getView = useCallback(() => {
    const { hands, names } = usePlayer.getState()
    return { hands, names, lang: useLang.getState().lang }
  }, [])

  return (
    <div className="player">
      <TopBar song={song} levels={levels} />
      <ChordLane clock={clock} chords={song.chords} />
      <div className="stage">
        <PianoRoll clock={clock} tempo={song.tempo} notes={notes} lo={lo} hi={hi} label={m.player.rollLabel} getView={getView} />
        {card && <ChordCard clock={clock} chords={song.chords} />}
      </div>
      <Controls clock={clock} duration={song.durationSec} playing={playing} onTogglePlay={togglePlay} />
      {piano.status === 'loading' && <div className="toast" role="status">{m.player.pianoLoading}</div>}
      {piano.status === 'failed' && <div className="toast warn" role="status">{m.player.pianoFailed}</div>}
      <div className="rotate-hint" aria-hidden="true">{m.player.rotate}</div>
    </div>
  )
}

export function PlayerScreen() {
  const { id = '' } = useParams()
  const m = useMessages()
  const [state, setState] = useState<{ song?: Song; error?: SongLoadErrorCode }>({})

  useEffect(() => {
    let alive = true
    setState({})
    loadSong(id).then(
      (song) => {
        if (!alive) return
        // Reset before Player first renders, so its clock never sees the previous song's loop.
        usePlayer.getState().reset(availableLevels(song))
        setState({ song })
      },
      (e: unknown) => alive && setState({ error: e instanceof SongLoadError ? e.code : 'network' }),
    )
    return () => {
      alive = false
    }
  }, [id])

  if (state.error) {
    return (
      <div className="player-message">
        <p>{m.errors[state.error]}</p>
        <Link to="/" className="pill-link"><ChevronLeft />{m.common.back}</Link>
      </div>
    )
  }
  if (!state.song) return <div className="player-message" role="status">{m.player.loading}</div>
  return <Player song={state.song} />
}
