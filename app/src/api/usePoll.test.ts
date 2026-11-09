import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { usePoll } from './usePoll'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('polls on an interval until stop says so', async () => {
  let n = 0
  const fn = vi.fn(async () => ++n)
  const { result } = renderHook(() => usePoll(fn, 2000, { stop: (v) => v >= 3 }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.data).toBe(1)
  await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(result.current.data).toBe(2)
  await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(result.current.data).toBe(3)
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(fn).toHaveBeenCalledTimes(3)
})

it('reports errors, keeps polling, and polls at once on refresh', async () => {
  const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('down')).mockResolvedValue('up')
  const { result } = renderHook(() => usePoll(fn, 2000))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(result.current.error).toBeInstanceOf(Error)
  await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(result.current).toMatchObject({ data: 'up', error: undefined })
  act(() => result.current.refresh())
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(fn).toHaveBeenCalledTimes(3)
})

it('does nothing while disabled', async () => {
  const fn = vi.fn(async () => 1)
  renderHook(() => usePoll(fn, 2000, { enabled: false }))
  await act(() => vi.advanceTimersByTimeAsync(5000))
  expect(fn).not.toHaveBeenCalled()
})
