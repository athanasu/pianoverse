import { act, render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError, type Api } from '../api/client'
import { useLang } from '../i18n/lang'
import { fakeApi } from '../test/fakeApi'
import { NewSong } from './NewSongScreen'
import { RecorderError, type Recorder, type Recording } from './recorder'
import type { MakeRecorder } from './useRecorder'

const SUBMIT = 'Τέλος — βγάλε μου πιάνο'

beforeEach(() => useLang.setState({ lang: 'el' }))

const renderNew = (api: Api, makeRecorder?: MakeRecorder) =>
  render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewSong api={api} probe={async () => 192} makeRecorder={makeRecorder} />} />
        <Route path="/processing/:jobId" element={<p>processing page</p>} />
      </Routes>
    </MemoryRouter>,
  )

async function pickFile(user: UserEvent, file: File) {
  await user.click(screen.getByRole('button', { name: 'Από αρχείο' }))
  await user.upload(screen.getByLabelText(/Διάλεξε αρχείο ήχου/), file)
}

const take = () => new File(['RIFF'], 'Take Five.mp3', { type: 'audio/mpeg' })

function fakeRecorder(durationSec = 27, overrides: Partial<Recorder> = {}) {
  let elapsed = 0
  const recording: Recording = { blob: new Blob(['x']), mimeType: 'audio/webm', filename: 'recording.webm', durationSec, startedAt: new Date(2026, 10, 9, 14, 32) }
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

it('uploads a picked file with the chosen mode and opens processing', async () => {
  const user = userEvent.setup()
  const api = fakeApi({ createJob: vi.fn(async () => 'j1') })
  renderNew(api)
  expect(screen.getByRole('heading', { name: 'Νέο τραγούδι' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Κλείσιμο' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled()

  const file = take()
  await pickFile(user, file)
  expect(screen.getByText('Take Five.mp3')).toBeInTheDocument()
  expect(await screen.findByText('3:12 · Άλλαξε αρχείο')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Αυτόματο' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Instrumental' }))
  expect(screen.getByRole('button', { name: 'Instrumental' })).toHaveAttribute('aria-pressed', 'true')

  await user.click(screen.getByRole('button', { name: SUBMIT }))
  expect(await screen.findByText('processing page')).toBeInTheDocument()
  expect(api.createJob).toHaveBeenCalledWith({ audio: file, filename: 'Take Five.mp3', title: 'Take Five', mode: 'instrumental', source: 'file' })
})

it('explains a rejected upload by its code', async () => {
  const user = userEvent.setup()
  renderNew(fakeApi({ createJob: vi.fn(async () => { throw new ApiError('too_long', 400, 'Too long.') }) }))
  await pickFile(user, take())
  await user.click(screen.getByRole('button', { name: SUBMIT }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Το κομμάτι είναι πολύ μεγάλο — μέγιστο 8 λεπτά.')
  expect(screen.queryByRole('button', { name: 'Δοκίμασε ξανά' })).not.toBeInTheDocument()
})

it('keeps the file after a network failure and retries it', async () => {
  const user = userEvent.setup()
  const createJob = vi.fn<Api['createJob']>().mockRejectedValueOnce(new ApiError('network', 0)).mockResolvedValue('j2')
  renderNew(fakeApi({ createJob }))
  await pickFile(user, take())
  await user.click(screen.getByRole('button', { name: SUBMIT }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Δεν βρίσκω τον server. Έλεγξε τη σύνδεση.')
  await user.click(screen.getByRole('button', { name: 'Δοκίμασε ξανά' }))
  expect(await screen.findByText('processing page')).toBeInTheDocument()
  expect(createJob).toHaveBeenCalledTimes(2)
  expect(createJob.mock.calls[1][0].filename).toBe('Take Five.mp3')
})

it('speaks English too', () => {
  useLang.setState({ lang: 'en' })
  renderNew(fakeApi())
  expect(screen.getByRole('heading', { name: 'New song' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Record' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Tap to start · up to 8:00')).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'What am I hearing?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Done — turn it into piano' })).toBeDisabled()
})

it('records, then "Done" stops and sends the take with a dated title', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(27)
  const api = fakeApi({ createJob: vi.fn(async () => 'j9') })
  renderNew(api, () => f.rec)
  expect(screen.getByText('Φέρε το κινητό κοντά στο ηχείο και δυνάμωσε την ένταση. Όσο πιο καθαρός ο ήχος, τόσο πιο σωστές οι συγχορδίες.')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  expect(await screen.findByRole('button', { name: 'Σταμάτα την ηχογράφηση' })).toBeInTheDocument()
  expect(screen.getByText('Ακούω… · μέγιστο 8:00')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled()

  f.setElapsed(27)
  expect(await screen.findByText('0:27')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: SUBMIT })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: SUBMIT }))

  expect(await screen.findByText('processing page')).toBeInTheDocument()
  expect(f.rec.stop).toHaveBeenCalled()
  expect(api.createJob).toHaveBeenCalledWith({
    audio: f.recording.blob,
    filename: 'recording.webm',
    title: 'Ηχογράφηση 9 Νοε, 14:32',
    mode: 'auto',
    source: 'recording',
  })
})

it('warns about takes under 10 seconds and keeps "Done" disabled', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(6)
  renderNew(fakeApi(), () => f.rec)
  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  await user.click(await screen.findByRole('button', { name: 'Σταμάτα την ηχογράφηση' }))
  expect(await screen.findByText('Η ηχογράφηση είναι πολύ μικρή — χρειάζονται τουλάχιστον 10 δευτερόλεπτα.')).toBeInTheDocument()
  expect(screen.getByText('0:06')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' })).toBeInTheDocument()
})

it('explains a blocked microphone and switches to upload', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(27, { start: async () => { throw new RecorderError('denied') } })
  renderNew(fakeApi(), () => f.rec)
  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  const card = await screen.findByRole('alert')
  expect(card).toHaveTextContent('Δεν έχω πρόσβαση στο μικρόφωνο')
  expect(card).toHaveTextContent('Ρυθμίσεις → Safari → Μικρόφωνο')
  expect(screen.getByRole('button', { name: 'Δοκίμασε ξανά' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Ανέβασε αρχείο' }))
  expect(screen.getByRole('button', { name: 'Από αρχείο' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText(/Διάλεξε αρχείο ήχου/)).toBeInTheDocument()
})

it('explains an insecure origin without offering a pointless retry', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(27, { start: async () => { throw new RecorderError('insecure') } })
  renderNew(fakeApi(), () => f.rec)
  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Η ηχογράφηση θέλει ασφαλή σύνδεση (https).')
  expect(screen.queryByRole('button', { name: 'Δοκίμασε ξανά' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ανέβασε αρχείο' })).toBeInTheDocument()
})

it('keeps the upload in flight: nothing can be picked, recorded or sent twice, and switching panels keeps it', async () => {
  const user = userEvent.setup()
  let finish: (jobId: string) => void = () => {}
  const createJob = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
  renderNew(fakeApi({ createJob }), () => fakeRecorder().rec)
  await pickFile(user, take())
  await user.click(screen.getByRole('button', { name: SUBMIT }))
  expect(await screen.findByRole('button', { name: 'Ανεβάζω…' })).toBeDisabled()
  expect(screen.getByLabelText(/Διάλεξε αρχείο ήχου|Take Five/)).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Ηχογράφηση' }))
  expect(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ανεβάζω…' })).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Από αρχείο' }))
  expect(screen.getByRole('button', { name: 'Ανεβάζω…' })).toBeDisabled()
  expect(createJob).toHaveBeenCalledTimes(1)

  await act(async () => finish('j1'))
  expect(await screen.findByText('processing page')).toBeInTheDocument()
})

it('keeps a recorded take in memory after a network failure and retries the same audio', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(27)
  const createJob = vi.fn<Api['createJob']>().mockRejectedValueOnce(new ApiError('network', 0)).mockResolvedValue('j3')
  renderNew(fakeApi({ createJob }), () => f.rec)
  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  await user.click(await screen.findByRole('button', { name: 'Σταμάτα την ηχογράφηση' }))
  await user.click(await screen.findByRole('button', { name: SUBMIT }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Δεν βρίσκω τον server.')
  await user.click(screen.getByRole('button', { name: 'Δοκίμασε ξανά' }))
  expect(await screen.findByText('processing page')).toBeInTheDocument()
  expect(createJob).toHaveBeenCalledTimes(2)
  expect(createJob.mock.calls[1][0].audio).toBe(f.recording.blob)
  expect(f.rec.stop).toHaveBeenCalledTimes(1)
})

it('needs half a second of margin over 10 seconds before "Done" is enabled', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(10.2)
  renderNew(fakeApi(), () => f.rec)
  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  await user.click(await screen.findByRole('button', { name: 'Σταμάτα την ηχογράφηση' }))
  expect(await screen.findByText('Η ηχογράφηση είναι πολύ μικρή — χρειάζονται τουλάχιστον 10 δευτερόλεπτα.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: SUBMIT })).toBeDisabled()
})

it('cancels a pending microphone request when switching to a file', async () => {
  const user = userEvent.setup()
  const f = fakeRecorder(27, { start: () => new Promise<void>(() => {}) })
  renderNew(fakeApi(), () => f.rec)
  await user.click(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' }))
  expect(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Από αρχείο' }))
  expect(f.rec.cancel).toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Ηχογράφηση' }))
  expect(screen.getByRole('button', { name: 'Ξεκίνα την ηχογράφηση' })).toBeEnabled()
})
