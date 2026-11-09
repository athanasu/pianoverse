import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { ApiError, type Api } from '../api/client'
import { useLang } from '../i18n/lang'
import { fakeApi } from '../test/fakeApi'
import { NewSong } from './NewSongScreen'

const SUBMIT = 'Τέλος — βγάλε μου πιάνο'

beforeEach(() => useLang.setState({ lang: 'el' }))

const renderNew = (api: Api) =>
  render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<NewSong api={api} probe={async () => 192} />} />
        <Route path="/processing/:jobId" element={<p>processing page</p>} />
      </Routes>
    </MemoryRouter>,
  )

async function pickFile(user: UserEvent, file: File) {
  await user.upload(screen.getByLabelText(/Διάλεξε αρχείο ήχου/), file)
}

const take = () => new File(['RIFF'], 'Take Five.mp3', { type: 'audio/mpeg' })

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
  expect(screen.getByLabelText(/Choose an audio file/)).toBeInTheDocument()
  expect(screen.getByRole('group', { name: 'What am I hearing?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Done — turn it into piano' })).toBeDisabled()
})
