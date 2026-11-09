import { useMessages } from '../i18n/lang'
import { formatTime } from '../player/timeline'
import { Alert, MicOff } from '../ui/icons'
import type { RecorderErrorCode } from './recorder'
import { WAVE_BARS, type RecorderState } from './useRecorder'

function Waveform({ levels }: { levels: number[] }) {
  return (
    <div className="wave" aria-hidden="true">
      {Array.from({ length: WAVE_BARS }, (_, i) => {
        const level = levels[i]
        const kind = level === undefined ? 'idle' : i % 3 === 0 ? 'hi' : ''
        return <span key={i} className={`wave-bar ${kind}`} style={{ height: 8 + Math.round((level ?? 0) * 68) }} />
      })}
    </div>
  )
}

export function RecordPanel({ state, disabled = false, onStart, onStop }: { state: RecorderState; disabled?: boolean; onStart: () => void; onStop: () => void }) {
  const m = useMessages()
  const recording = state.phase === 'recording'
  const seconds = state.phase === 'recording' ? state.elapsedSec : state.phase === 'done' ? state.recording.durationSec : 0
  const hint = recording ? m.newSong.listening : state.phase === 'done' ? m.newSong.recorded : m.newSong.tapToStart
  return (
    <div className="record-panel">
      <div className="rec-clock">
        <span className="rec-time" role="timer">{formatTime(seconds)}</span>
        <span className="rec-hint">{hint}</span>
      </div>
      <Waveform levels={recording ? state.levels : []} />
      <div className={recording ? 'rec-ring live' : 'rec-ring'}>
        <button
          type="button"
          className="rec-btn"
          aria-label={recording ? m.newSong.stop : m.newSong.start}
          disabled={disabled || state.phase === 'starting'}
          onClick={recording ? onStop : onStart}
        >
          <span className={recording ? 'rec-glyph stop' : 'rec-glyph start'} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function MicCard({ code, disabled = false, onRetry, onUpload }: { code: RecorderErrorCode; disabled?: boolean; onRetry: () => void; onUpload: () => void }) {
  const m = useMessages()
  const canRetry = code === 'denied' || code === 'no_mic'
  return (
    <div className="mic-card" role="alert">
      <span className="mic-icon"><MicOff /></span>
      <h2 className="mic-title">{m.newSong.mic.title}</h2>
      <p className="mic-text">{m.newSong.mic[code]}</p>
      <div className="mic-actions">
        <button type="button" className="pill-btn primary" onClick={onUpload}>{m.newSong.mic.upload}</button>
        {canRetry && <button type="button" className="pill-btn" disabled={disabled} onClick={onRetry}>{m.common.retry}</button>}
      </div>
    </div>
  )
}

export function RecordTip() {
  const m = useMessages()
  return (
    <div className="tip-card">
      <Alert />
      <p>{m.newSong.tip}</p>
    </div>
  )
}
