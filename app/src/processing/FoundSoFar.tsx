import type { JobPreview } from '../api/types'
import { useMessages } from '../i18n/lang'

export function FoundSoFar({ preview }: { preview: JobPreview }) {
  const m = useMessages()
  return (
    <section className="found">
      <h2 className="field-label">{m.processing.found}</h2>
      <div className="found-row">
        {preview.chords.map((chord, i) => (
          <span key={`${chord}-${i}`} className={i === 0 ? 'found-chip first' : 'found-chip'}>{chord}</span>
        ))}
        <span className="found-bpm">{Math.round(preview.bpm)} BPM</span>
      </div>
    </section>
  )
}
