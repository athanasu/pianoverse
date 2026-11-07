import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useLang } from '../i18n/lang'
import * as piano from '../audio/piano'
import { PlayerScreen } from './PlayerScreen'
import { usePlayer } from './store'

vi.mock('../audio/piano', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audio/piano')>()),
  unlockAudio: vi.fn(),
  createSampler: vi.fn().mockRejectedValue(new Error('no audio in tests')),
}))

const demo = readFileSync(resolve(import.meta.dirname, '../../public/songs/demo/song.json'), 'utf-8')

beforeEach(() => {
  useLang.setState({ lang: 'el' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(demo, { status: 200 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const FAILED = 'Δεν φορτώθηκε ο ήχος του πιάνου· οι νότες συνεχίζουν χωρίς ήχο.'
const LOADING = 'Φορτώνω τον ήχο του πιάνου…'
const fakeSampler = (): piano.SamplerLike => ({ trigger: vi.fn(), releaseAll: vi.fn(), now: () => 0, dispose: vi.fn() })

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/song/:id" element={<PlayerScreen />} />
      </Routes>
    </MemoryRouter>,
  )

it('loads a song and drives the controls', async () => {
  const user = userEvent.setup()
  renderAt('/song/demo')
  expect(await screen.findByText('Demo · Am F C G')).toBeInTheDocument()
  expect(screen.getByText('Λα ελάσσονα · 90 BPM · 4/4')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Νότες που πέφτουν προς το πληκτρολόγιο' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Εύκολο' }))
  expect(usePlayer.getState().level).toBe('easy')
  expect(screen.getByRole('button', { name: 'Εύκολο' })).toHaveAttribute('aria-pressed', 'true')

  await user.click(screen.getByRole('button', { name: /^Ταχύτητα/ }))
  expect(screen.getByRole('button', { name: 'Ταχύτητα 25%' })).toHaveTextContent('25%')

  await user.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  expect(screen.getByRole('button', { name: 'Παύση' })).toBeInTheDocument()
  expect(await screen.findByText(FAILED)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Επανάληψη A–B' }))
  expect(usePlayer.getState().loop).not.toBeNull()
})

it('shows the chord card and switches it off', async () => {
  const user = userEvent.setup()
  renderAt('/song/demo')
  expect(await screen.findByText('Λα ελάσσονα', { selector: '.cc-long' })).toBeInTheDocument()
  expect(screen.getByText(/^δάχτυλα /, { selector: '.cc-fingers' })).toBeInTheDocument()
  expect(document.querySelector('.chord-card')).not.toHaveAttribute('aria-live')
  await user.click(screen.getByRole('button', { name: 'Κάρτα συγχορδίας' }))
  expect(screen.queryByText('Λα ελάσσονα', { selector: '.cc-long' })).not.toBeInTheDocument()
})

it('reports a missing song', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
  renderAt('/song/nope')
  expect(await screen.findByText('Δεν βρέθηκε αυτό το κομμάτι.')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('link', { name: 'Πίσω στη βιβλιοθήκη' })).toBeInTheDocument())
})

it('reports a missing song in English', async () => {
  useLang.setState({ lang: 'en' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
  renderAt('/song/nope')
  expect(await screen.findByText("We couldn't find this song.")).toBeInTheDocument()
})

it('disposes a sampler that resolves after unmount and never starts the engine', async () => {
  const user = userEvent.setup()
  const dispose = vi.fn()
  let resolve!: (s: piano.SamplerLike) => void
  vi.mocked(piano.createSampler).mockReturnValueOnce(new Promise((r) => (resolve = r)))
  const start = vi.spyOn(piano.PianoEngine.prototype, 'start')
  const { unmount } = renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  await user.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  unmount()
  resolve({ trigger: vi.fn(), releaseAll: vi.fn(), now: () => 0, dispose })
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))
  expect(start).not.toHaveBeenCalled()
  start.mockRestore()
})

it('opens every song fresh, whatever loop the previous song left in the store', async () => {
  usePlayer.setState({ loop: { a: 10, b: 15 } })
  renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  expect(screen.getByRole('button', { name: 'Επανάληψη A–B' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText(/^0:00 \//)).toBeInTheDocument()
  expect(usePlayer.getState().loop).toBeNull()
})

it('silences the piano when the level changes', async () => {
  const user = userEvent.setup()
  const releaseAll = vi.fn()
  vi.mocked(piano.createSampler).mockResolvedValueOnce({ trigger: vi.fn(), releaseAll, now: () => 0, dispose: vi.fn() })
  renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  await user.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  await screen.findByRole('button', { name: 'Παύση' })
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  releaseAll.mockClear()
  await user.click(screen.getByRole('button', { name: 'Εύκολο' }))
  expect(releaseAll).toHaveBeenCalled()
})

it('plays at once when the piano failed to load, and hides the warning after 5 s', async () => {
  renderAt('/song/demo')
  expect(await screen.findByText(FAILED)).toBeInTheDocument()
  const loads = vi.mocked(piano.createSampler).mock.calls.length
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  expect(screen.getByRole('button', { name: 'Παύση' })).toBeInTheDocument()
  expect(piano.unlockAudio).toHaveBeenCalled()
  expect(piano.createSampler).toHaveBeenCalledTimes(loads + 1)
  await act(async () => {}) // the press retried the load; let it fail again
  await act(() => vi.advanceTimersByTimeAsync(4500))
  expect(screen.getByText(FAILED)).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(1000))
  expect(screen.queryByText(FAILED)).not.toBeInTheDocument()
})

it('loads the piano on open and starts playing only once it is ready', async () => {
  const user = userEvent.setup()
  let resolve!: (s: piano.SamplerLike) => void
  vi.mocked(piano.createSampler).mockReturnValueOnce(new Promise((r) => (resolve = r)))
  renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  expect(screen.getByRole('button', { name: 'Αναπαραγωγή' })).toBeInTheDocument()
  expect(screen.getByText(LOADING)).toBeInTheDocument()
  resolve(fakeSampler())
  expect(await screen.findByRole('button', { name: 'Παύση' })).toBeInTheDocument()
  expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
})

it('stops waiting for a slow piano after 8 s and plays silently', async () => {
  vi.mocked(piano.createSampler).mockReturnValueOnce(new Promise(() => {}))
  renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  await act(() => vi.advanceTimersByTimeAsync(7900))
  expect(screen.getByRole('button', { name: 'Αναπαραγωγή' })).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(200))
  expect(screen.getByRole('button', { name: 'Παύση' })).toBeInTheDocument()
  expect(screen.queryByText(LOADING)).not.toBeInTheDocument()
})

it('shows one chip per engine warning code, falling back to the engine message', async () => {
  const song = JSON.parse(demo)
  song.warnings = [
    { code: 'chords_uncertain', message: 'x', start: 1, end: 2 },
    { code: 'chords_uncertain', message: 'x', start: 5, end: 6 },
    { code: 'melody_sparse', message: 'y' },
    { code: 'tempo_drift', message: 'The tempo drifts.' },
    { code: 'tempo_drift', message: 'The tempo drifts again.' },
  ]
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(song), { status: 200 })))
  const { container } = renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  const chips = [...container.querySelectorAll('.warn-chip')].map((c) => c.textContent)
  expect(chips).toEqual([
    'Αβέβαιες συγχορδίες σε 2 σημεία',
    'Η μελωδία ακούγεται μόνο σε λίγα σημεία του κομματιού.',
    'The tempo drifts.',
  ])
})

it('toggling the right hand off while playing sounds the right hand and silences the left', async () => {
  const user = userEvent.setup()
  const sampler = fakeSampler()
  vi.mocked(piano.createSampler).mockResolvedValueOnce(sampler)
  renderAt('/song/demo')
  await screen.findByText('Demo · Am F C G')
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  vi.mocked(sampler.releaseAll).mockClear()
  await user.click(screen.getByRole('button', { name: 'Δεξί χέρι' }))
  expect(sampler.releaseAll).toHaveBeenCalled()
  vi.mocked(sampler.trigger).mockClear()
  // Jump to ~5.1 s: both hands play at 5.33 s (demo: left hand <= MIDI 55, right hand >= MIDI 71).
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
  await waitFor(() => expect(sampler.trigger).toHaveBeenCalled(), { timeout: 2000 })
  const octaves = vi.mocked(sampler.trigger).mock.calls.map(([name]) => Number(name.slice(-1)))
  expect(octaves.every((o) => o >= 4)).toBe(true)
})
