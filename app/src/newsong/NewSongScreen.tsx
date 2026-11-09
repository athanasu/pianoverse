import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { getApi, type Api } from '../api/client'
import { errorText } from '../api/errorText'
import type { Mode } from '../api/types'
import { useLang, useMessages } from '../i18n/lang'
import { Close } from '../ui/icons'
import { FilePanel, type PickedFile } from './FilePanel'
import { ModeChips } from './ModeChips'
import { probeDuration } from './probe'
import { MicCard, RecordPanel, RecordTip } from './RecordPanel'
import { MIN_RECORDING_SEC, type Recording } from './recorder'
import { defaultTitle } from './title'
import { useRecorder, type MakeRecorder } from './useRecorder'
import { useSubmit } from './useSubmit'

type Tab = 'record' | 'file'

export interface NewSongProps {
  api: Api
  probe?: (file: Blob) => Promise<number | null>
  makeRecorder?: MakeRecorder
}

export function NewSong({ api, probe = probeDuration, makeRecorder }: NewSongProps) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  const [tab, setTab] = useState<Tab>('record')
  const [mode, setMode] = useState<Mode>('auto')
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const recorder = useRecorder(makeRecorder)
  const submit = useSubmit(api)
  const rec = recorder.state

  const sending = submit.state.status === 'sending'
  // Only an error is cleared by editing; a request in flight must stay visible so no second job is sent.
  const clearError = () => {
    if (submit.state.status === 'error') submit.clear()
  }

  const switchTab = (next: Tab) => {
    if (rec.phase === 'recording') void recorder.stop()
    clearError()
    setTab(next)
  }
  const pick = (file: File) => {
    if (sending) return
    clearError()
    setPicked({ file, durationSec: null })
    void probe(file).then((durationSec) => setPicked((p) => (p?.file === file ? { file, durationSec } : p)))
  }
  const startRecording = () => {
    if (sending) return
    clearError()
    void recorder.start()
  }

  const recordedSec = rec.phase === 'recording' ? rec.elapsedSec : rec.phase === 'done' ? rec.recording.durationSec : 0
  const tooShort = tab === 'record' && rec.phase === 'done' && recordedSec < MIN_RECORDING_SEC
  const ready = tab === 'file' ? picked !== null : (rec.phase === 'recording' || rec.phase === 'done') && recordedSec >= MIN_RECORDING_SEC
  const error = submit.state.status === 'error' ? submit.state : null

  const sendRecording = (take: Recording) =>
    submit.send({ audio: take.blob, filename: take.filename, title: defaultTitle({ kind: 'recording', at: take.startedAt }, lang), mode, source: 'recording' })

  const send = async () => {
    if (tab === 'file') {
      if (picked) {
        const { file } = picked
        await submit.send({ audio: file, filename: file.name, title: defaultTitle({ kind: 'file', name: file.name }, lang), mode, source: 'file' })
      }
      return
    }
    if (sending) return
    // "Done" while recording stops the take and sends it in one tap, as in the mockup.
    const take = rec.phase === 'done' ? rec.recording : await recorder.stop()
    if (take && take.durationSec >= MIN_RECORDING_SEC) await sendRecording(take)
  }

  return (
    <div className="screen new-song">
      <header className="screen-head">
        <Link to="/" className="icon-btn" aria-label={m.common.close}><Close /></Link>
        <h1 className="screen-title">{m.newSong.title}</h1>
      </header>
      <div className="tabs" role="group" aria-label={m.newSong.source}>
        <button type="button" aria-pressed={tab === 'record'} onClick={() => switchTab('record')}>{m.newSong.record}</button>
        <button type="button" aria-pressed={tab === 'file'} onClick={() => switchTab('file')}>{m.newSong.file}</button>
      </div>
      {tab === 'file' && <FilePanel picked={picked} onPick={pick} disabled={sending} />}
      {tab === 'record' && rec.phase === 'error' && (
        <MicCard code={rec.code} disabled={sending} onRetry={startRecording} onUpload={() => switchTab('file')} />
      )}
      {tab === 'record' && rec.phase !== 'error' && (
        <RecordPanel state={rec} disabled={sending} onStart={startRecording} onStop={() => void recorder.stop()} />
      )}
      {tooShort && <p className="form-warn" role="status">{m.newSong.tooShort}</p>}
      <ModeChips value={mode} onChange={setMode} />
      {tab === 'record' && rec.phase !== 'error' && <RecordTip />}
      {error && (
        <div className="form-error" role="alert">
          <span>{errorText(m, error.code, error.message)}</span>
          {error.code === 'network' && <button type="button" className="text-btn" onClick={() => void send()}>{m.common.retry}</button>}
        </div>
      )}
      <button type="button" className="cta" disabled={!ready || sending} onClick={() => void send()}>
        {sending ? m.newSong.sending : m.newSong.submit}
      </button>
    </div>
  )
}

export function NewSongScreen() {
  const api = useMemo(() => getApi(), [])
  return api ? <NewSong api={api} /> : <Navigate to="/" replace />
}
