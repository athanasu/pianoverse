import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Route } from '@playwright/test'

const API_ORIGIN = 'http://api.test'
const demoSong = readFileSync(new URL('../public/songs/demo/song.json', import.meta.url), 'utf-8')
const demoSummary = { id: 'demo', title: 'Demo · Am F C G', key: { tonic: 'A', mode: 'minor' }, bpm: 90, durationSec: 22.3, sourceType: 'instrumental', chords: ['Am', 'F', 'C', 'G'] }
const job = { id: 'j1', title: 'Take Five', source: 'file', durationSec: 12, createdAt: '2026-11-09T12:00:00Z' }
const preview = { key: { tonic: 'A', mode: 'minor' }, bpm: 90, timeSignature: [4, 4], chords: ['Am', 'F', 'C', 'G'] }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-allow-methods': 'GET, POST, DELETE' }

// 16-bit mono PCM silence: a real file the browser can read the length of.
function wav(seconds: number, rate = 8000): Buffer {
  const bytes = seconds * rate * 2
  const b = Buffer.alloc(44 + bytes)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + bytes, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(bytes, 40)
  return b
}

async function fakeServer(page: Page) {
  const state = { down: false, finish: false, uploadType: '' }
  await page.route((url) => url.origin === API_ORIGIN, async (route: Route) => {
    const req = route.request()
    if (state.down) return route.abort()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.headers()['authorization'] !== 'Bearer e2e-key') return json({ error: { code: 'unauthorized', message: 'Bad key.' } }, 401)

    const url = new URL(req.url())
    const path = url.pathname + url.search
    if (path === '/api/songs') return json(state.finish ? [demoSummary] : [])
    if (path === '/api/jobs?active=1') return json([])
    if (path === '/api/jobs' && req.method() === 'POST') {
      state.uploadType = req.headers()['content-type'] ?? ''
      return json({ jobId: 'j1' }, 202)
    }
    if (path === '/api/jobs/j1') {
      return json(state.finish ? { ...job, status: 'done', progress: 1, songId: 'demo', preview } : { ...job, status: 'analyzing', progress: 0.35, preview })
    }
    if (path === '/api/songs/demo') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: demoSong })
    return json({ error: { code: 'not_found', message: 'Not found.' } }, 404)
  })
  return state
}

test.beforeEach(async ({ page }) => {
  // The piano samples come from the network; the app must keep working without them.
  await page.route('https://tonejs.github.io/**', (route) => route.abort())
  await page.addInitScript(() => localStorage.setItem('pianoverse.lang', 'el'))
})

test('upload a file → processing → player → library', async ({ page }) => {
  const server = await fakeServer(page)
  await page.goto('/')
  await expect(page.getByText('Δεν υπάρχουν ακόμα κομμάτια.')).toBeVisible()

  await page.getByRole('link', { name: 'Νέο' }).click()
  await expect(page.getByRole('heading', { name: 'Νέο τραγούδι' })).toBeVisible()
  await page.getByRole('button', { name: 'Από αρχείο' }).click()
  await page.getByLabel(/Διάλεξε αρχείο ήχου/).setInputFiles({ name: 'Take Five.wav', mimeType: 'audio/wav', buffer: wav(12) })
  await expect(page.getByText('Take Five.wav')).toBeVisible()
  await expect(page.getByText('0:12 · Άλλαξε αρχείο')).toBeVisible()
  await page.getByRole('button', { name: 'Instrumental' }).click()
  await page.getByRole('button', { name: 'Τέλος — βγάλε μου πιάνο' }).click()

  await expect(page).toHaveURL(/\/processing\/j1$/)
  await expect(page.getByRole('heading', { name: 'Φτιάχνω τη διασκευή σου' })).toBeVisible()
  await expect(page.getByText('Αρχείο · 0:12')).toBeVisible()
  await expect(page.getByText('Λα ελάσσονα · 4/4')).toBeVisible()
  await expect(page.getByText('90 BPM')).toBeVisible()
  expect(server.uploadType).toMatch(/^multipart\/form-data/)

  server.finish = true
  await expect(page).toHaveURL(/\/song\/demo$/, { timeout: 10_000 })
  await expect(page.getByRole('img', { name: 'Νότες που πέφτουν προς το πληκτρολόγιο' })).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('link', { name: /Demo · Am F C G/ })).toBeVisible()
})

test('the library says when the server is down and recovers on retry', async ({ page }) => {
  const server = await fakeServer(page)
  server.down = true
  await page.goto('/')
  await expect(page.getByText('Δεν βρίσκω τον server.')).toBeVisible()
  server.down = false
  await page.getByRole('button', { name: 'Δοκίμασε ξανά' }).click()
  await expect(page.getByText('Δεν υπάρχουν ακόμα κομμάτια.')).toBeVisible()
  await expect(page.getByText('Δεν βρίσκω τον server.')).toBeHidden()
})
