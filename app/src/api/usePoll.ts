import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollOptions<T> {
  enabled?: boolean
  stop?: (value: T) => boolean
}

export interface Poll<T> {
  data: T | undefined
  error: unknown
  refresh: () => void
}

export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, opts: PollOptions<T> = {}): Poll<T> {
  const { enabled = true } = opts
  // Latest callbacks without restarting the loop on every render.
  const fnRef = useRef(fn)
  const stopRef = useRef(opts.stop)
  fnRef.current = fn
  stopRef.current = opts.stop

  const [data, setData] = useState<T>()
  const [error, setError] = useState<unknown>()
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // setTimeout after each settle (not setInterval) so a slow server never gets overlapping requests.
    const tick = async () => {
      let again = true
      try {
        const value = await fnRef.current()
        if (!alive) return
        setData(value)
        setError(undefined)
        again = !stopRef.current?.(value)
      } catch (e) {
        if (!alive) return
        setError(e)
      }
      if (again) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [enabled, intervalMs, round])

  const refresh = useCallback(() => setRound((r) => r + 1), [])
  return { data, error, refresh }
}
