import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, useLang } from '../i18n/lang'
import { API_URL, apiFetch, jsonResponse } from '../test/apiFetch'
import { LibraryScreen } from './LibraryScreen'

const index = [{ id: 'demo', title: 'Demo · Am F C G', key: { tonic: 'A', mode: 'minor' }, bpm: 90, durationSec: 22.3, sourceType: 'instrumental', chords: ['Am', 'F', 'C', 'G'] }]

beforeEach(() => {
  localStorage.clear()
  useLang.setState({ lang: 'el' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(index), { status: 200 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

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
  expect(screen.getByText('Η ηχογράφηση έρχεται σύντομα')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Νέο' })).not.toBeInTheDocument()
  unmount()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
  expect(await screen.findByText('Δεν μπόρεσα να φορτώσω το κομμάτι. Έλεγξε τη σύνδεση.')).toBeInTheDocument()
})

describe('with the backend', () => {
  const running = { id: 'j1', title: 'Take five', status: 'analyzing', progress: 0.35, source: 'file', durationSec: 192, createdAt: '2026-11-09T12:00:00Z' }
  const failed = { id: 'j2', title: 'Hum', status: 'failed', progress: 0.05, source: 'recording', durationSec: 12, createdAt: '2026-11-09T11:00:00Z', error: { code: 'silent', message: 'Nothing to hear.' } }

  beforeEach(() => vi.stubEnv('VITE_API_URL', API_URL))

  it('shows + New, running and failed jobs, then songs, and dismisses a failure', async () => {
    const fetchMock = apiFetch({
      'GET /api/songs': () => jsonResponse(index),
      'GET /api/jobs?active=1': () => jsonResponse([running, failed]),
      'DELETE /api/jobs/j2': () => new Response(null, { status: 204 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<MemoryRouter><LibraryScreen /></MemoryRouter>)

    expect(await screen.findByRole('link', { name: /Take five/ })).toHaveAttribute('href', '/processing/j1')
    expect(screen.getByText('Βρίσκω ρυθμό και συγχορδίες')).toBeInTheDocument()
    expect(screen.getByText('Δεν ακούγεται τίποτα στην ηχογράφηση.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Νέο' })).toHaveAttribute('href', '/new')
    expect(screen.queryByText('Η ηχογράφηση έρχεται σύντομα')).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Demo · Am F C G/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Απόρριψη' }))
    expect(screen.queryByText('Hum')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/api/jobs/j2`, expect.objectContaining({ method: 'DELETE' }))
  })

  // Real timers on purpose: the songs reload goes through Response.json(), which fake timers can stall.
  it('reloads the songs when a job finishes', async () => {
    let jobPolls = 0
    vi.stubGlobal('fetch', apiFetch({
      'GET /api/jobs?active=1': () => jsonResponse(jobPolls++ === 0 ? [running] : []),
      'GET /api/songs': () => jsonResponse(jobPolls >= 2 ? index : []),
    }))
    render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /Take five/ })).toBeInTheDocument()
    expect(screen.queryByText('Δεν υπάρχουν ακόμα κομμάτια.')).not.toBeInTheDocument()

    // The next poll (2 s later) finds the job gone, and the library reloads its songs.
    expect(await screen.findByRole('link', { name: /Demo · Am F C G/ }, { timeout: 3500 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Take five/ })).not.toBeInTheDocument()
  })

  it('says when the server is down and retries', async () => {
    let up = false
    vi.stubGlobal('fetch', apiFetch({
      'GET /api/songs': () => {
        if (!up) throw new TypeError('down')
        return jsonResponse(index)
      },
      'GET /api/jobs?active=1': () => jsonResponse([]),
    }))
    const user = userEvent.setup()
    render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
    expect(await screen.findByText('Δεν βρίσκω τον server.')).toBeInTheDocument()
    up = true
    await user.click(screen.getByRole('button', { name: 'Δοκίμασε ξανά' }))
    expect(await screen.findByRole('link', { name: /Demo · Am F C G/ })).toBeInTheDocument()
    expect(screen.queryByText('Δεν βρίσκω τον server.')).not.toBeInTheDocument()
  })

  it('says the key was rejected, not that the server is down, on a 401', async () => {
    vi.stubGlobal('fetch', apiFetch({
      'GET /api/songs': () => jsonResponse({ error: { code: 'unauthorized', message: 'no' } }, 401),
      'GET /api/jobs?active=1': () => jsonResponse({ error: { code: 'unauthorized', message: 'no' } }, 401),
    }))
    render(<MemoryRouter><LibraryScreen /></MemoryRouter>)
    expect(await screen.findByText('Ο server δεν δέχτηκε το κλειδί της εφαρμογής.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Δοκίμασε ξανά' })).toBeInTheDocument()
    expect(screen.queryByText('Δεν βρίσκω τον server.')).not.toBeInTheDocument()
  })
})
