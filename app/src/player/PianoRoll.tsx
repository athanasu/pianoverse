import { useEffect, useRef } from 'react'
import { visualTime } from '../audio/piano'
import type { Lang } from '../i18n/messages'
import type { Note, Tempo } from '../song/types'
import { layoutKeyboard } from './keyboard'
import { LOOKAHEAD_SEC, buildFrame, drawFrame } from './renderer'
import type { PlaybackClock } from './transport'

export interface RollView { hands: { L: boolean; R: boolean }; names: boolean; lang: Lang }

interface Props {
  clock: PlaybackClock
  tempo: Tempo
  notes: Note[]
  lo: number
  hi: number
  label: string
  getView: () => RollView
}

export function PianoRoll({ clock, tempo, notes, lo, hi, label, getView }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const notesRef = useRef(notes)
  const viewRef = useRef(getView)
  notesRef.current = notes
  viewRef.current = getView

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let size = { w: 0, h: 0 }
    let layout = layoutKeyboard(lo, hi, 1)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      size = { w: rect.width, h: rect.height }
      layout = layoutKeyboard(lo, hi, rect.width)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    let raf = 0
    const frame = () => {
      if (size.w <= 0 || size.h <= 0) {
        raf = requestAnimationFrame(frame)
        return
      }
      const view = viewRef.current()
      const keyboardHeight = Math.min(96, Math.max(64, size.h * 0.3))
      drawFrame(ctx, buildFrame({
        notes: notesRef.current, layout, tempo, now: visualTime(clock.now(), clock.rate()), lookahead: LOOKAHEAD_SEC,
        width: size.w, height: size.h, keyboardHeight, hands: view.hands, names: view.names, lang: view.lang,
      }))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [clock, tempo, lo, hi])

  return <canvas ref={canvasRef} className="roll-canvas" role="img" aria-label={label} />
}
