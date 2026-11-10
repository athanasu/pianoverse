import { useMessages } from '../i18n/lang'
import { Upload } from './icons'

/** Covers the page while a file is dragged over it; the drop itself is handled by useFileDrop. */
export function DropOverlay() {
  const m = useMessages()
  return (
    <div className="drop-overlay" data-testid="drop-overlay">
      <div className="drop-frame">
        <span className="drop-icon"><Upload /></span>
        <span className="drop-title">{m.common.dropHere}</span>
        <span className="drop-hint">{m.newSong.pickHint}</span>
      </div>
    </div>
  )
}
