import { useCallback, useEffect, useRef, useState } from 'react'
import { RecorderError, createRecorder, type Recorder, type RecorderErrorCode, type Recording } from './recorder'

export const WAVE_BARS = 44
const TICK_MS = 100
// Speech or music near a phone mic sits around 0.05–0.25 RMS; this fills the bar range.
const LEVEL_GAIN = 4

export type RecorderState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'recording'; elapsedSec: number; levels: number[] }
  | { phase: 'done'; recording: Recording }
  | { phase: 'error'; code: RecorderErrorCode }

export type MakeRecorder = (onAutoStop: (recording: Recording) => void) => Recorder

const browserRecorder: MakeRecorder = (onAutoStop) => createRecorder(undefined, { onAutoStop })

export function useRecorder(make: MakeRecorder = browserRecorder) {
  const [state, setState] = useState<RecorderState>({ phase: 'idle' })
  const recRef = useRef<Recorder | null>(null)
  const lastRef = useRef<Recording | null>(null)

  const finish = useCallback((recording: Recording) => {
    lastRef.current = recording
    setState({ phase: 'done', recording })
  }, [])

  useEffect(() => () => recRef.current?.cancel(), [])

  useEffect(() => {
    if (state.phase !== 'recording') return
    const id = setInterval(() => {
      const rec = recRef.current
      if (!rec) return
      const level = Math.min(1, rec.level() * LEVEL_GAIN)
      setState((s) =>
        s.phase === 'recording' ? { phase: 'recording', elapsedSec: rec.elapsedSec(), levels: [...s.levels, level].slice(-WAVE_BARS) } : s,
      )
    }, TICK_MS)
    return () => clearInterval(id)
  }, [state.phase])

  const start = useCallback(async () => {
    recRef.current?.cancel()
    lastRef.current = null
    const rec = make(finish)
    recRef.current = rec
    setState({ phase: 'starting' })
    try {
      await rec.start()
      setState({ phase: 'recording', elapsedSec: 0, levels: [] })
    } catch (e) {
      recRef.current = null
      setState({ phase: 'error', code: e instanceof RecorderError ? e.code : 'no_mic' })
    }
  }, [make, finish])

  const stop = useCallback(async (): Promise<Recording | null> => {
    const rec = recRef.current
    if (!rec) return lastRef.current
    try {
      const recording = await rec.stop()
      finish(recording)
      return recording
    } catch {
      // Already stopped by the 8:00 limit; that take is the one to use.
      return lastRef.current
    }
  }, [finish])

  return { state, start, stop }
}
