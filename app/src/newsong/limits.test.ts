import { expect, it } from 'vitest'
import { fileProblem, MAX_FILE_BYTES } from './limits'

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

it('accepts audio, video containers and files the browser cannot name', () => {
  expect(fileProblem(file('a.mp3', 'audio/mpeg'), 192)).toBeNull()
  expect(fileProblem(file('a.mp4', 'video/mp4'), 192)).toBeNull()
  expect(fileProblem(file('a.flac', ''), null)).toBeNull()
  expect(fileProblem(file('a.ogg', 'application/ogg'), 30)).toBeNull()
})

it('names the first problem: kind, then size, then length', () => {
  expect(fileProblem(file('a.pdf', 'application/pdf', MAX_FILE_BYTES + 1), 4)).toBe('not_audio')
  expect(fileProblem(file('a.mp3', 'audio/mpeg', MAX_FILE_BYTES + 1), 4)).toBe('too_large')
  expect(fileProblem(file('a.mp3', 'audio/mpeg', MAX_FILE_BYTES), 4)).toBe('too_short')
  expect(fileProblem(file('a.mp3', 'audio/mpeg'), 481)).toBe('too_long')
})

it('leaves the length to the server when it is unknown', () => {
  expect(fileProblem(file('a.mp3', 'audio/mpeg'), null)).toBeNull()
})
