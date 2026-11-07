import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PianoEngine, createSampler } from '../audio/piano'
import type { Note } from '../song/types'
import type { PlaybackClock } from './transport'

export function useClockTime(clock: PlaybackClock, intervalMs = 100): number {
  const [t, setT] = useState(() => clock.now())
  useEffect(() => {
    const id = setInterval(() => setT(clock.now()), intervalMs)
    const off = clock.subscribe(() => setT(clock.now()))
    return () => {
      clearInterval(id)
      off()
    }
  }, [clock, intervalMs])
  return t
}

export function useClockPlaying(clock: PlaybackClock): boolean {
  return useSyncExternalStore(
    (onChange) => clock.subscribe(onChange),
    () => clock.isPlaying(),
  )
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    navigator.wakeLock.request('screen').then(
      (l) => {
        if (cancelled) void l.release()
        else lock = l
      },
      () => {},
    )
    return () => {
      cancelled = true
      lock?.release().catch(() => {})
    }
  }, [active])
}

export type PianoStatus = 'loading' | 'ready' | 'failed'

const PLAY_WAIT_MS = 8000
const FAILED_TOAST_MS = 5000

// Loads the piano on mount (decoding works while the audio context is still suspended).
// `getNotes` is read on every engine tick, so it must return the notes to sound right now.
export function usePiano(clock: PlaybackClock, getNotes: () => Note[]) {
  const engine = useRef<PianoEngine | null>(null)
  const gen = useRef(0)
  const pending = useRef<Promise<void> | null>(null)
  const waitId = useRef(0)
  const [status, setStatus] = useState<PianoStatus>('loading')
  const [waiting, setWaiting] = useState(false)
  const [failures, setFailures] = useState(0)
  const [hiddenFailures, setHiddenFailures] = useState(0)

  const load = useCallback(() => {
    const mine = gen.current
    setStatus('loading')
    pending.current = createSampler().then(
      (sampler) => {
        if (gen.current !== mine) return sampler.dispose()
        engine.current = new PianoEngine(clock, sampler, getNotes)
        engine.current.start()
        setStatus('ready')
      },
      () => {
        if (gen.current !== mine) return
        setStatus('failed')
        setFailures((n) => n + 1)
      },
    )
  }, [clock, getNotes])

  useEffect(() => {
    load()
    return () => {
      gen.current++
      waitId.current++
      engine.current?.stop()
      engine.current = null
    }
  }, [load])

  useEffect(() => {
    if (failures === 0) return
    const id = setTimeout(() => setHiddenFailures(failures), FAILED_TOAST_MS)
    return () => clearTimeout(id)
  }, [failures])

  // Runs `start` now if the piano has settled; while it is loading, once it settles or after PLAY_WAIT_MS.
  const whenLoaded = (start: () => void) => {
    if (status === 'failed') load()
    if (status !== 'loading') return start()
    const mine = ++waitId.current
    setWaiting(true)
    const go = () => {
      clearTimeout(timer)
      if (waitId.current !== mine) return
      waitId.current++
      setWaiting(false)
      start()
    }
    const timer = setTimeout(go, PLAY_WAIT_MS)
    void pending.current?.then(go)
  }

  const cancelWait = () => {
    waitId.current++
    setWaiting(false)
  }

  const silence = useCallback(() => engine.current?.silence(), [])

  const toast: 'loading' | 'failed' | null =
    waiting ? 'loading' : status === 'failed' && failures !== hiddenFailures ? 'failed' : null

  return { waiting, toast, whenLoaded, cancelWait, silence }
}
