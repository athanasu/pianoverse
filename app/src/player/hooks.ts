import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { PianoEngine, createSampler, preloadTone, unlockAudio } from '../audio/piano'
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

export type PianoStatus = 'idle' | 'loading' | 'ready' | 'failed'

export function usePiano(clock: PlaybackClock, notesRef: RefObject<Note[]>) {
  const engine = useRef<PianoEngine | null>(null)
  const started = useRef(false)
  const gen = useRef(0)
  const [status, setStatus] = useState<PianoStatus>('idle')

  useEffect(() => {
    preloadTone().catch(() => {})
  }, [])

  const ensure = useCallback(async () => {
    unlockAudio()
    if (started.current) return
    started.current = true
    const mine = gen.current
    setStatus('loading')
    try {
      const sampler = await createSampler()
      if (gen.current !== mine) {
        sampler.dispose()
        return
      }
      engine.current = new PianoEngine(clock, sampler, () => notesRef.current ?? [])
      engine.current.start()
      setStatus('ready')
    } catch {
      if (gen.current !== mine) return
      started.current = false
      setStatus('failed')
    }
  }, [clock, notesRef])

  const silence = useCallback(() => engine.current?.silence(), [])

  useEffect(
    () => () => {
      gen.current++
      engine.current?.stop()
      engine.current = null
      started.current = false
    },
    [clock],
  )

  return { status, ensure, silence }
}
