import type { JobPreview, JobStatus } from '../api/types'
import { useLang, useMessages } from '../i18n/lang'
import { keyName } from '../i18n/music'
import { Check } from '../ui/icons'
import { stepStates } from './steps'

export function StepList({ status, preview }: { status: JobStatus; preview?: JobPreview }) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  return (
    <ol className="steps">
      {stepStates(status).map(({ id, state }) => {
        const detail =
          id === 'analyzing' && preview
            ? `${keyName(preview.key.tonic, preview.key.mode, lang)} · ${preview.timeSignature[0]}/${preview.timeSignature[1]}`
            : m.processing.steps[id].detail
        return (
          <li key={id} className={`step ${state}`} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="step-dot" aria-hidden="true">{state === 'done' && <Check />}</span>
            <span className="step-body">
              <span className="step-label">
                {m.processing.steps[id].label}
                <span className="sr-only"> · {m.processing.stepState[state]}</span>
              </span>
              <span className="step-detail">{detail}</span>
              {state === 'active' && <span className="step-bar" aria-hidden="true"><span /></span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
