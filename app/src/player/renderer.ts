import type { Lang } from '../i18n/messages'
import { noteName } from '../i18n/music'
import type { Hand, Note, Tempo } from '../song/types'
import { THEME } from '../styles/theme'
import type { KeyRect, KeyboardLayout } from './keyboard'
import { activeKeys, visibleNoteRects, type NoteRect } from './roll'
import { beatMarks } from './timeline'

export const LOOKAHEAD_SEC = 3

export interface DrawRect extends NoteRect { dim: boolean; label: string }

export interface Frame {
  width: number
  height: number
  rollHeight: number
  keyboardHeight: number
  whites: KeyRect[]
  blacks: KeyRect[]
  lit: Map<number, Hand>
  rects: DrawRect[]
  beatLines: { y: number; strong: boolean }[]
  lanes: number[]
  cLabels: { x: number; label: string; pitch: number }[]
}

export interface FrameInput {
  notes: Note[]
  layout: KeyboardLayout
  tempo: Tempo
  now: number
  lookahead: number
  width: number
  height: number
  keyboardHeight: number
  hands: { L: boolean; R: boolean }
  names: boolean
  lang: Lang
}

export function buildFrame(i: FrameInput): Frame {
  const rollHeight = i.height - i.keyboardHeight
  const pps = rollHeight / i.lookahead
  const rects = visibleNoteRects(i.notes, i.layout, i.now, i.lookahead, rollHeight).map((r) => ({
    ...r,
    dim: !i.hands[r.hand],
    label: i.names && !r.black && r.h >= 16 ? noteName(r.pitch, i.lang) : '',
  }))
  const lit = new Map([...activeKeys(i.notes, i.now)].filter(([, hand]) => i.hands[hand]))
  return {
    width: i.width,
    height: i.height,
    rollHeight,
    keyboardHeight: i.keyboardHeight,
    whites: i.layout.whites,
    blacks: i.layout.blacks,
    lit,
    rects,
    beatLines: beatMarks(i.tempo, i.now, i.lookahead).map((b) => ({ y: rollHeight - (b.t - i.now) * pps, strong: b.strong })),
    lanes: i.layout.whites.filter((k) => k.pitch % 12 === 0 || k.pitch % 12 === 5).map((k) => k.x),
    cLabels: i.layout.whites.filter((k) => k.pitch % 12 === 0).map((k) => ({ x: k.x + k.w / 2, label: `C${Math.floor(k.pitch / 12) - 1}`, pitch: k.pitch })),
  }
}

const handColor = (h: Hand) => (h === 'L' ? THEME.left : THEME.right)
const handGlow = (h: Hand) => (h === 'L' ? THEME.leftGlow : THEME.rightGlow)

export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame): void {
  const T = THEME
  ctx.clearRect(0, 0, f.width, f.height)
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.fillStyle = T.roll
  ctx.fillRect(0, 0, f.width, f.rollHeight)
  ctx.fillStyle = T.lane
  for (const x of f.lanes) ctx.fillRect(x, 0, 1, f.rollHeight)
  for (const b of f.beatLines) {
    ctx.fillStyle = b.strong ? T.bar : T.beat
    ctx.fillRect(0, b.y, f.width, 1)
  }

  // White-key notes span the full key width, so black-key notes go last to stay on top.
  const ordered = [...f.rects.filter((r) => !r.black), ...f.rects.filter((r) => r.black)]
  for (const r of ordered) {
    const gradient = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
    gradient.addColorStop(0, r.hand === 'L' ? T.leftHi : T.rightHi)
    gradient.addColorStop(1, handColor(r.hand))
    const glow = r.active && !r.dim
    ctx.globalAlpha = r.dim ? 0.22 : 1
    ctx.shadowColor = glow ? handGlow(r.hand) : 'transparent'
    ctx.shadowBlur = glow ? 16 : 0
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(6, r.w / 2, r.h / 2))
    ctx.fill()
    if (r.label) {
      ctx.shadowBlur = 0
      ctx.fillStyle = r.hand === 'L' ? T.leftInk : T.rightInk
      ctx.font = `700 9px ${T.fontBody}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(r.label, r.x + r.w / 2, r.y + r.h - 3)
    }
  }
  ctx.globalAlpha = 1

  ctx.shadowColor = T.hitGlow
  ctx.shadowBlur = 12
  ctx.fillStyle = T.hit
  ctx.fillRect(0, f.rollHeight - 2, f.width, 2)

  const top = f.rollHeight
  for (const k of f.whites) {
    const hand = f.lit.get(k.pitch)
    ctx.shadowColor = hand ? handGlow(hand) : 'transparent'
    ctx.shadowBlur = hand ? 22 : 0
    ctx.fillStyle = hand ? handColor(hand) : T.keyWhite
    ctx.beginPath()
    ctx.roundRect(k.x + 0.5, top, k.w - 1, f.keyboardHeight, [0, 0, 5, 5])
    ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.fillStyle = T.keyLabel
  ctx.font = `600 9px ${T.fontMono}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (const c of f.cLabels) if (!f.lit.has(c.pitch)) ctx.fillText(c.label, c.x, top + f.keyboardHeight - 5)

  const blackHeight = f.keyboardHeight * 0.62
  for (const k of f.blacks) {
    const hand = f.lit.get(k.pitch)
    ctx.shadowColor = hand ? handGlow(hand) : 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = hand ? 18 : 3
    ctx.fillStyle = hand ? handColor(hand) : T.keyBlack
    ctx.beginPath()
    ctx.roundRect(k.x, top, k.w, blackHeight, [0, 0, 4, 4])
    ctx.fill()
  }
  ctx.shadowBlur = 0
}
