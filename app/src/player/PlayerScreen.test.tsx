import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useLang } from '../i18n/lang'
import * as piano from '../audio/piano'
import { PlayerScreen } from './PlayerScreen'
import { usePlayer } from './store'

vi.mock('../audio/piano', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audio/piano')>()),
  preloadTone: vi.fn().mockResolvedValue({}),
  unlockAudio: vi.fn(),
  createSampler: vi.fn().mockRejectedValue(new Error('no audio in tests')),
}))

const demo = readFileSync(resolve(import.meta.dirname, '../../public/songs/demo/song.json'), 'utf-8')

beforeEach(() => {
  useLang.setState({ lang: 'el' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(demo, { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

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

  await user.click(screen.getByRole('button', { name: 'Ταχύτητα' }))
  expect(screen.getByRole('button', { name: 'Ταχύτητα' })).toHaveTextContent('25%')

  await user.click(screen.getByRole('button', { name: 'Αναπαραγωγή' }))
  expect(screen.getByRole('button', { name: 'Παύση' })).toBeInTheDocument()
  expect(await screen.findByText('Δεν φόρτωσε ο ήχος του πιάνου· οι νότες συνεχίζουν χωρίς ήχο.')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Επανάληψη A–B' }))
  expect(usePlayer.getState().loop).not.toBeNull()
})

it('shows the chord card and switches it off', async () => {
  const user = userEvent.setup()
  renderAt('/song/demo')
  expect(await screen.findByText('Λα ελάσσονα', { selector: '.cc-long' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Κάρτα συγχορδίας' }))
  expect(screen.queryByText('Λα ελάσσονα', { selector: '.cc-long' })).not.toBeInTheDocument()
})

it('reports a missing song', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
  renderAt('/song/nope')
  expect(await screen.findByText('Δεν βρέθηκε αυτό το κομμάτι.')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('link', { name: 'Πίσω στη βιβλιοθήκη' })).toBeInTheDocument())
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
  resolve({ trigger: vi.fn(), now: () => 0, dispose })
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))
  expect(start).not.toHaveBeenCalled()
  start.mockRestore()
})
