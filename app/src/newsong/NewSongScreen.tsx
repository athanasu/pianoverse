import { useEffect, useId, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { getApi, type Api } from '../api/client'
import { errorText } from '../api/errorText'
import type { Mode } from '../api/types'
import { useLang, useMessages } from '../i18n/lang'
import { DropOverlay } from '../ui/DropOverlay'
import { Close } from '../ui/icons'
import { useFileDrop } from '../ui/useFileDrop'
import { FilePanel, type PickedFile } from './FilePanel'
import { peekHandOff, takeHandOff } from './handoff'
import { fileProblem } from './limits'
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
  const titleId = useId()
  // A file handed over by the library opens straight on the file tab.
  const [tab, setTab] = useState<Tab>(() => (peekHandOff() ? 'file' : 'record'))
  const [mode, setMode] = useState<Mode>('auto')
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const [title, setTitle] = useState('')
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
    else if (rec.phase === 'starting') recorder.cancel()
    clearError()
    setTab(next)
  }
  const pick = (file: File) => {
    if (sending) return
    clearError()
    setTitle('')
    setPicked({ file, durationSec: null })
    void probe(file).then((durationSec) => setPicked((p) => (p?.file === file ? { file, durationSec } : p)))
  }
  const dropFile = (file: File) => {
    if (tab !== 'file') switchTab('file')
    pick(file)
  }
  const dragging = useFileDrop(dropFile, !sending)

  useEffect(() => {
    const file = takeHandOff()
    if (file) pick(file)
    // Runs once: the handed-over file is taken on arrival.
  }, [])
  const startRecording = () => {
    if (sending) return
    clearError()
    void recorder.start()
  }

  const recordedSec = rec.phase === 'recording' ? rec.elapsedSec : rec.phase === 'done' ? rec.recording.durationSec : 0
  const tooShort = tab === 'record' && rec.phase === 'done' && recordedSec < MIN_RECORDING_SEC
  const problem = tab === 'file' && picked ? fileProblem(picked.file, picked.durationSec) : null
  const ready = tab === 'file' ? picked !== null && problem === null : (rec.phase === 'recording' || rec.phase === 'done') && recordedSec >= MIN_RECORDING_SEC
  // A file's own problem already says why it cannot be sent; the server's answer would only repeat it.
  const error = submit.state.status === 'error' && !problem ? submit.state : null

  // The title can be edited once there is something to name; left empty, the suggestion is used.
  const suggestedTitle =
    tab === 'file'
      ? picked && !problem ? defaultTitle({ kind: 'file', name: picked.file.name }, lang) : null
      : rec.phase === 'done' && !tooShort ? defaultTitle({ kind: 'recording', at: rec.recording.startedAt }, lang) : null
  const problemText = problem === 'not_audio' ? m.newSong.notAudio : problem ? m.apiErrors[problem] : null

  const sendRecording = (take: Recording) =>
    submit.send({ audio: take.blob, filename: take.filename, title: title.trim() || defaultTitle({ kind: 'recording', at: take.startedAt }, lang), mode, source: 'recording' })

  const send = async () => {
    if (sending) return
    if (tab === 'file') {
      if (picked && !problem) {
        const { file } = picked
        await submit.send({ audio: file, filename: file.name, title: title.trim() || defaultTitle({ kind: 'file', name: file.name }, lang), mode, source: 'file' })
      }
      return
    }
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
      {problemText && <div className="form-error" role="alert"><span>{problemText}</span></div>}
      {tab === 'record' && rec.phase === 'error' && (
        <MicCard code={rec.code} disabled={sending} onRetry={startRecording} onUpload={() => switchTab('file')} />
      )}
      {tab === 'record' && rec.phase !== 'error' && (
        <RecordPanel state={rec} disabled={sending} onStart={startRecording} onStop={() => void recorder.stop()} />
      )}
      {tooShort && <p className="form-warn" role="status">{m.newSong.tooShort}</p>}
      {suggestedTitle !== null && (
        <section className="field">
          <label className="field-label" htmlFor={titleId}>{m.newSong.songTitle}</label>
          <input
            id={titleId}
            className="text-input"
            type="text"
            value={title}
            placeholder={suggestedTitle}
            maxLength={120}
            autoComplete="off"
            disabled={sending}
            onChange={(e) => setTitle(e.target.value)}
          />
        </section>
      )}
      <ModeChips value={mode} onChange={setMode} />
      {tab === 'record' && rec.phase !== 'error' && suggestedTitle === null && <RecordTip />}
      {error && (
        <div className="form-error" role="alert">
          <span>{errorText(m, error.code, error.message)}</span>
          {error.code === 'network' && <button type="button" className="text-btn" onClick={() => void send()}>{m.common.retry}</button>}
        </div>
      )}
      <div className="cta-bar">
        <button type="button" className="cta" disabled={!ready || sending} onClick={() => void send()}>
          {sending ? m.newSong.sending : m.newSong.submit}
        </button>
      </div>
      {dragging && <DropOverlay />}
    </div>
  )
}

export function NewSongScreen() {
  const api = useMemo(() => getApi(), [])
  return api ? <NewSong api={api} /> : <Navigate to="/" replace />
}
