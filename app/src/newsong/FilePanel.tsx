import { useId } from 'react'
import { useMessages } from '../i18n/lang'
import { formatTime } from '../player/timeline'
import { AudioFile, Upload } from '../ui/icons'

export interface PickedFile {
  file: File
  durationSec: number | null
}

/** The file area: click it to browse; dropping a file anywhere on the screen lands here too. */
export function FilePanel({ picked, onPick, disabled = false }: { picked: PickedFile | null; onPick: (file: File) => void; disabled?: boolean }) {
  const m = useMessages()
  const inputId = useId()
  return (
    <div className="file-panel">
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="audio/*"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          // Lets the same file be picked again after an error.
          e.target.value = ''
        }}
      />
      {picked ? (
        <label htmlFor={inputId} className="file-pick picked">
          <span className="file-icon"><AudioFile /></span>
          <span className="file-body">
            <span className="file-name">{picked.file.name}</span>
            <span className="file-meta">{picked.durationSec !== null && `${formatTime(picked.durationSec)} · `}{m.newSong.changeFile}</span>
          </span>
        </label>
      ) : (
        <label htmlFor={inputId} className="file-pick">
          <span className="file-icon"><Upload /></span>
          <span className="file-name">{m.newSong.pickFile}</span>
          <span className="file-or">{m.newSong.orDrop}</span>
          <span className="file-meta">{m.newSong.pickHint}</span>
        </label>
      )}
    </div>
  )
}
