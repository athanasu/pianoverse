import { useId } from 'react'
import { MODES, type Mode } from '../api/types'
import { useMessages } from '../i18n/lang'

export function ModeChips({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  const m = useMessages()
  const labelId = useId()
  return (
    <section className="field">
      <div className="field-label" id={labelId}>{m.newSong.whatIsIt}</div>
      <div className="mode-chips" role="group" aria-labelledby={labelId}>
        {MODES.map((mode) => (
          <button key={mode} type="button" className="mode-chip" aria-pressed={value === mode} onClick={() => onChange(mode)}>
            {m.newSong.modes[mode]}
          </button>
        ))}
      </div>
    </section>
  )
}
