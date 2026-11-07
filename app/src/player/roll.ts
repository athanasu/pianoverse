import type { Hand, Note } from '../song/types'
import type { KeyboardLayout } from './keyboard'

export interface NoteRect { pitch: number; hand: Hand; x: number; y: number; w: number; h: number; active: boolean; black: boolean }

export function visibleNoteRects(notes: Note[], layout: KeyboardLayout, now: number, lookahead: number, height: number): NoteRect[] {
  const pps = height / lookahead
  const out: NoteRect[] = []
  for (const n of notes) {
    if (n.end <= now || n.start >= now + lookahead) continue
    const key = layout.byPitch.get(n.pitch)
    if (!key) continue
    const bottom = Math.min(height, height - (n.start - now) * pps)
    const top = Math.max(0, height - (n.end - now) * pps)
    const pad = key.black ? 1 : 2
    out.push({
      pitch: n.pitch, hand: n.hand, black: key.black,
      x: key.x + pad, w: key.w - pad * 2, y: top, h: bottom - top,
      active: n.start <= now && now < n.end,
    })
  }
  return out
}

export function activeKeys(notes: Note[], now: number): Map<number, Hand> {
  const keys = new Map<number, Hand>()
  for (const n of notes) if (n.start <= now && now < n.end) keys.set(n.pitch, n.hand)
  return keys
}
