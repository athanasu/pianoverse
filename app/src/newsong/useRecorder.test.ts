import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RecorderError, type Recorder, type Recording } from './recorder'
import { useRecorder } from './useRecorder'

function fakeRecorder(overrides: Partial<Recorder> = {}) {
  let elapsed = 0
  const recording: Recording = { blob: new Blob(['x']), mimeType: 'audio/webm', filename: 'recording.webm', durationSec: 12, startedAt: new Date(2026, 10, 9, 14, 32) }
  const rec: Recorder = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => recording),
    elapsedSec: () => elapsed,
    level: () => 0.1,
    cancel: vi.fn(),
    ...overrides,
  }
  return { rec, recording, setElapsed: (sec: number) => { elapsed = sec } }
}

afterEach(() => vi.useRealTimers())

it('starts, ticks the timer and waveform, and stops with the recording', async () => {
  vi.useFakeTimers()
  const f = fakeRecorder()
  const { result } = renderHook(() => useRecorder(() => f.rec))
  await act(() => result.current.start())
  expect(result.current.state).toEqual({ phase: 'recording', elapsedSec: 0, levels: [] })

  f.setElapsed(1.5)
  await act(() => vi.advanceTimersByTimeAsync(300))
  expect(result.current.state).toEqual({ phase: 'recording', elapsedSec: 1.5, levels: [0.4, 0.4, 0.4] })

  let out: Recording | null = null
  await act(async () => {
    out = await result.current.stop()
  })
  expect(out).toBe(f.recording)
  expect(result.current.state).toEqual({ phase: 'done', recording: f.recording })
})

it('reports why the microphone is unavailable', async () => {
  const f = fakeRecorder({ start: async () => { throw new RecorderError('denied') } })
  const { result } = renderHook(() => useRecorder(() => f.rec))
  await act(() => result.current.start())
  expect(result.current.state).toEqual({ phase: 'error', code: 'denied' })
})

it('lands on done when the recorder stops itself, and stop() still returns that take', async () => {
  let autoStop: (recording: Recording) => void = () => {}
  const f = fakeRecorder({ stop: async () => { throw new Error('not recording') } })
  const { result } = renderHook(() =>
    useRecorder((onAutoStop) => {
      autoStop = onAutoStop
      return f.rec
    }),
  )
  await act(() => result.current.start())
  act(() => autoStop(f.recording))
  expect(result.current.state).toEqual({ phase: 'done', recording: f.recording })
  await expect(result.current.stop()).resolves.toBe(f.recording)
})

it('releases the microphone on unmount', async () => {
  const f = fakeRecorder()
  const { result, unmount } = renderHook(() => useRecorder(() => f.rec))
  await act(() => result.current.start())
  unmount()
  expect(f.rec.cancel).toHaveBeenCalled()
})
