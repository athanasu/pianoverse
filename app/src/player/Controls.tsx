import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMessages } from '../i18n/lang'
import { LoopIcon, PauseIcon, PlayIcon } from '../ui/icons'
import { useClockTime } from './hooks'
import { SpeedControl } from './SpeedControl'
import { usePlayer } from './store'
import { defaultLoop, formatTime, xToTime } from './timeline'
import type { PlaybackClock } from './transport'
import type { Loop } from './types'

interface TimelineProps {
  position: number
  duration: number
  loop: Loop | null
  label: string
  onSeek: (t: number) => void
  onLoop: (loop: Loop) => void
}

function Timeline({ position, duration, loop, label, onSeek, onLoop }: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<Loop | null>(null)
  const timeAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    return r ? xToTime(clientX - r.left, r.width, duration) : 0
  }
  const pct = (t: number) => `${(duration > 0 ? t / duration : 0) * 100}%`
  const shown = preview ?? loop

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { x0: e.clientX, t0: timeAt(e.clientX), moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x0) > 8) d.moved = true
    if (d.moved) {
      const t = timeAt(e.clientX)
      setPreview({ a: Math.min(d.t0, t), b: Math.max(d.t0, t) })
    }
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (d?.moved) {
      const t = timeAt(e.clientX)
      onLoop({ a: Math.min(d.t0, t), b: Math.max(d.t0, t) })
    } else if (d) onSeek(timeAt(e.clientX))
    setPreview(null)
  }
  const onPointerCancel = () => {
    drag.current = null
    setPreview(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') onSeek(position - 5)
    if (e.key === 'ArrowRight') onSeek(position + 5)
  }

  return (
    <div
      ref={ref}
      className="timeline"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={formatTime(position)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <div className="track">
        {shown && (
          <>
            <div className="loop-region" style={{ left: pct(shown.a), width: pct(shown.b - shown.a) }} />
            <span className="loop-mark" style={{ left: pct(shown.a) }}>A</span>
            <span className="loop-mark" style={{ left: pct(shown.b) }}>B</span>
          </>
        )}
        <div className="progress" style={{ width: pct(position) }} />
        <div className="thumb" style={{ left: pct(position) }} />
      </div>
    </div>
  )
}

interface Props { clock: PlaybackClock; duration: number; playing: boolean; onTogglePlay: () => void }

export function Controls({ clock, duration, playing, onTogglePlay }: Props) {
  const m = useMessages()
  const t = useClockTime(clock)
  const { hands, loop, names } = usePlayer(useShallow((s) => ({ hands: s.hands, loop: s.loop, names: s.names })))
  const { toggleHand, setLoop, toggleNames } = usePlayer.getState()

  return (
    <div className="controls">
      <button type="button" className="play-btn" aria-label={playing ? m.player.pause : m.player.play} onClick={onTogglePlay}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="time">{`${formatTime(t)} / ${formatTime(duration)}`}</span>
      <Timeline position={t} duration={duration} loop={loop} label={m.player.timeline} onSeek={(x) => clock.seek(x)} onLoop={setLoop} />
      <button type="button" className="ctl" aria-pressed={loop !== null} aria-label={m.player.loop}
        onClick={() => setLoop(loop ? null : defaultLoop(clock.now(), duration))}><LoopIcon /></button>
      <SpeedControl />
      <button type="button" className="ctl" aria-pressed={hands.L} aria-label={m.player.leftHand} onClick={() => toggleHand('L')}>
        <span className="dot left" aria-hidden="true" />{m.player.leftShort}
      </button>
      <button type="button" className="ctl" aria-pressed={hands.R} aria-label={m.player.rightHand} onClick={() => toggleHand('R')}>
        <span className="dot right" aria-hidden="true" />{m.player.rightShort}
      </button>
      <button type="button" className="ctl" aria-pressed={names} aria-label={m.player.noteNames} onClick={toggleNames}>{m.player.noteNamesShort}</button>
    </div>
  )
}
