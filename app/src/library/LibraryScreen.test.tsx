import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LANG_KEY, useLang } from '../i18n/lang'
import { LibraryScreen } from './LibraryScreen'

const index = [{ id: 'demo', title: 'Demo · Am F C G', key: { tonic: 'A', mode: 'minor' }, bpm: 90, durationSec: 22.3, sourceType: 'instrumental', chords: ['Am', 'F', 'C', 'G'] }]

beforeEach(() => {
  localStorage.clear()
  useLang.setState({ lang: 'el' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(index), { status: 200 })))
})
afterEach(() => vi.unstubAllGlobals())

it('lists songs with key, tempo, length and chords', async () => {
  render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
  const link = await screen.findByRole('link', { name: /Demo · Am F C G/ })
  expect(link).toHaveAttribute('href', '/song/demo')
  expect(screen.getByText('Λα ελάσσονα · 90 BPM · 0:22')).toBeInTheDocument()
  expect(screen.getByText('Ορχηστρικό')).toBeInTheDocument()
  expect(screen.getByText('Am')).toBeInTheDocument()
})

it('switches language and remembers it', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
  expect(await screen.findByText('Τα κομμάτια σου')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'EN' }))
  expect(screen.getByText('Your songs')).toBeInTheDocument()
  expect(screen.getByText('A minor · 90 BPM · 0:22')).toBeInTheDocument()
  expect(screen.getByText('Instrumental')).toBeInTheDocument()
  expect(localStorage.getItem(LANG_KEY)).toBe('en')
})

it('shows an empty state and load errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
  const { unmount } = render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
  expect(await screen.findByText('Δεν υπάρχουν ακόμα κομμάτια.')).toBeInTheDocument()
  unmount()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
  expect(await screen.findByText('Δεν μπόρεσα να φορτώσω το κομμάτι. Έλεγξε τη σύνδεση.')).toBeInTheDocument()
})
