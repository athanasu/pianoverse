import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useMessages } from '../i18n/lang'
import { Minus, Plus } from '../ui/icons'
import { SPEED_MAX, SPEED_MIN, SPEED_PRESETS, SPEED_STEP, speedPercent, usePlayer } from './store'

const fraction = (percent: number) => (percent - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)

/** The speed button and its panel: a slider with fine steps, plus one-tap presets. */
export function SpeedControl() {
  const m = useMessages()
  const percent = usePlayer((s) => speedPercent(s.speed))
  const { setSpeedPercent, stepSpeed } = usePlayer.getState()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="speed" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="ctl mono"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${m.player.speed} ${percent}%`}
        onClick={() => setOpen(!open)}
      >
        {percent}%
      </button>
      {open && (
        <div id={panelId} className="speed-panel" role="group" aria-label={m.player.speed}>
          <div className="speed-head">
            <span className="lane-label">{m.player.speed}</span>
            <span className="speed-value">{percent}%</span>
          </div>
          <div className="speed-row">
            <button type="button" className="speed-step" aria-label={m.player.slower} disabled={percent <= SPEED_MIN}
              onClick={() => stepSpeed(-1)}><Minus /></button>
            <div className="speed-track">
              {/* Marks the original tempo on the slider. */}
              <span className="speed-mark" style={{ '--f': fraction(100) } as CSSProperties} aria-hidden="true" />
              <input
                type="range"
                className="speed-slider"
                min={SPEED_MIN}
                max={SPEED_MAX}
                step={SPEED_STEP}
                value={percent}
                aria-label={m.player.speed}
                aria-valuetext={`${percent}%`}
                style={{ '--f': fraction(percent) } as CSSProperties}
                onChange={(e) => setSpeedPercent(Number(e.target.value))}
              />
            </div>
            <button type="button" className="speed-step" aria-label={m.player.faster} disabled={percent >= SPEED_MAX}
              onClick={() => stepSpeed(1)}><Plus /></button>
          </div>
          <div className="speed-presets">
            {SPEED_PRESETS.map((preset) => (
              <button key={preset} type="button" className="speed-preset" aria-pressed={preset === percent}
                onClick={() => setSpeedPercent(preset)}>{preset}%</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
