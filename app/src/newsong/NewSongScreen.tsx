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
import { defaultTitle } from './title'
import { useSubmit } from './useSubmit'

export interface NewSongProps {
  api: Api
  probe?: (file: Blob) => Promise<number | null>
}

export function NewSong({ api, probe = probeDuration }: NewSongProps) {
  const m = useMessages()
  const lang = useLang((s) => s.lang)
  const [mode, setMode] = useState<Mode>('auto')
  const [picked, setPicked] = useState<PickedFile | null>(null)
  const submit = useSubmit(api)

  const pick = (file: File) => {
    submit.clear()
    setPicked({ file, durationSec: null })
    void probe(file).then((durationSec) => setPicked((p) => (p?.file === file ? { file, durationSec } : p)))
  }
  const send = () => {
    if (!picked) return
    const { file } = picked
    void submit.send({ audio: file, filename: file.name, title: defaultTitle({ kind: 'file', name: file.name }, lang), mode, source: 'file' })
  }
  const sending = submit.state.status === 'sending'
  const error = submit.state.status === 'error' ? submit.state : null

  return (
    <div className="screen new-song">
      <header className="screen-head">
        <Link to="/" className="icon-btn" aria-label={m.common.close}><Close /></Link>
        <h1 className="screen-title">{m.newSong.title}</h1>
      </header>
      <FilePanel picked={picked} onPick={pick} />
      <ModeChips value={mode} onChange={setMode} />
      {error && (
        <div className="form-error" role="alert">
          <span>{errorText(m, error.code, error.message)}</span>
          {error.code === 'network' && <button type="button" className="text-btn" onClick={send}>{m.common.retry}</button>}
        </div>
      )}
      <button type="button" className="cta" disabled={!picked || sending} onClick={send}>
        {sending ? m.newSong.sending : m.newSong.submit}
      </button>
    </div>
  )
}

export function NewSongScreen() {
  const api = useMemo(() => getApi(), [])
  return api ? <NewSong api={api} /> : <Navigate to="/" replace />
}
