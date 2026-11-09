import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError, type Api } from '../api/client'
import type { Job, JobPreview } from '../api/types'
import { useLang } from '../i18n/lang'
import { fakeApi } from '../test/fakeApi'
import { Processing } from './ProcessingScreen'

const preview: JobPreview = { key: { tonic: 'A', mode: 'minor' }, bpm: 90.4, timeSignature: [4, 4], chords: ['Am', 'F', 'C', 'G'] }
const job = (over: Partial<Job> = {}): Job => ({
  id: 'j1', title: 'Take five', status: 'analyzing', progress: 0.35, source: 'recording', durationSec: 27, createdAt: '2026-11-09T12:00:00Z', ...over,
})

const renderAt = (api: Api) =>
  render(
    <MemoryRouter initialEntries={['/processing/j1']}>
      <Routes>
        <Route path="/processing/j1" element={<Processing api={api} jobId="j1" />} />
        <Route path="/song/s1" element={<p>song page</p>} />
        <Route path="/new" element={<p>new song page</p>} />
        <Route path="/" element={<p>library page</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => useLang.setState({ lang: 'el' }))
afterEach(() => vi.useRealTimers())

it('shows the stage and what was found so far, then opens the song when done', async () => {
  vi.useFakeTimers()
  const getJob = vi.fn<Api['getJob']>()
    .mockResolvedValueOnce(job({ preview }))
    .mockResolvedValue(job({ status: 'done', progress: 1, songId: 's1', preview }))
  renderAt(fakeApi({ getJob }))
  await act(() => vi.advanceTimersByTimeAsync(0))

  expect(screen.getByText('Ηχογράφηση · 0:27')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Φτιάχνω τη διασκευή σου' })).toBeInTheDocument()
  expect(screen.getByText('Take five')).toBeInTheDocument()
  const steps = screen.getAllByRole('listitem')
  expect(steps).toHaveLength(4)
  expect(steps[0]).toHaveTextContent('Χωρίζω τα όργανα · ολοκληρώθηκε')
  expect(steps[1]).toHaveAttribute('aria-current', 'step')
  expect(steps[1]).toHaveTextContent('Λα ελάσσονα · 4/4')
  expect(steps[3]).toHaveTextContent('σε αναμονή')
  expect(screen.getByRole('heading', { name: 'Βρήκα μέχρι τώρα' })).toBeInTheDocument()
  expect(screen.getByText('Am')).toBeInTheDocument()
  expect(screen.getByText('90 BPM')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Συνέχισε στο παρασκήνιο' })).toHaveAttribute('href', '/')

  await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(screen.getByText('song page')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(getJob).toHaveBeenCalledTimes(2)
})

it('explains a failed job and offers to try again', async () => {
  const user = userEvent.setup()
  const getJob = vi.fn<Api['getJob']>().mockResolvedValue(job({ status: 'failed', error: { code: 'no_beats', message: 'No steady beat.' } }))
  renderAt(fakeApi({ getJob }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Δεν βρήκα σταθερό ρυθμό στο κομμάτι.')
  expect(screen.getByRole('heading', { name: 'Αυτή τη φορά δεν τα κατάφερα' })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Συνέχισε στο παρασκήνιο' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('link', { name: 'Δοκίμασε ξανά' }))
  expect(await screen.findByText('new song page')).toBeInTheDocument()
  expect(getJob).toHaveBeenCalledTimes(1)
})

it('keeps polling through a dropped connection', async () => {
  vi.useFakeTimers()
  const getJob = vi.fn<Api['getJob']>().mockRejectedValueOnce(new ApiError('network', 0)).mockResolvedValue(job({ status: 'queued', progress: 0 }))
  renderAt(fakeApi({ getJob }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.getByText('Χάθηκε η σύνδεση — ξαναδοκιμάζω…')).toBeInTheDocument()
  await act(() => vi.advanceTimersByTimeAsync(2000))
  expect(screen.queryByText('Χάθηκε η σύνδεση — ξαναδοκιμάζω…')).not.toBeInTheDocument()
  expect(screen.getByText('Περιμένω τη σειρά μου…')).toBeInTheDocument()
  expect(screen.queryByRole('listitem', { current: 'step' })).not.toBeInTheDocument()
})

it('says when the job does not exist and stops asking', async () => {
  vi.useFakeTimers()
  const getJob = vi.fn<Api['getJob']>().mockRejectedValue(new ApiError('not_found', 404))
  renderAt(fakeApi({ getJob }))
  await act(() => vi.advanceTimersByTimeAsync(0))
  expect(screen.getByText('Δεν βρέθηκε αυτή η ανάλυση.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Πίσω στη βιβλιοθήκη' })).toHaveAttribute('href', '/')
  await act(() => vi.advanceTimersByTimeAsync(10_000))
  expect(getJob).toHaveBeenCalledTimes(1)
})

it('speaks English too', async () => {
  useLang.setState({ lang: 'en' })
  renderAt(fakeApi({ getJob: vi.fn(async () => job({ source: 'file', durationSec: 192, status: 'separating', progress: 0.05 })) }))
  expect(await screen.findByText('File · 3:12')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Building your arrangement' })).toBeInTheDocument()
  expect(screen.getByText('Separating the instruments')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Continue in the background' })).toBeInTheDocument()
})
