import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('opens on the library', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
  render(<App />)
  expect(screen.getByText('Pianoverse')).toBeInTheDocument()
  expect(await screen.findByRole('group', { name: /Γλώσσα|Language/ })).toBeInTheDocument()
})

it('sends unknown routes to the library', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
  window.history.pushState({}, '', '/nope')
  render(<App />)
  expect(await screen.findByRole('group', { name: /Γλώσσα|Language/ })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
})

it('opens New song only with a backend', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
  window.history.pushState({}, '', '/new')
  const { unmount } = render(<App />)
  expect(await screen.findByRole('group', { name: /Γλώσσα|Language/ })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  unmount()

  vi.stubEnv('VITE_API_URL', 'http://api.test')
  window.history.pushState({}, '', '/new')
  render(<App />)
  expect(await screen.findByRole('heading', { name: /Νέο τραγούδι|New song/ })).toBeInTheDocument()
})

it('opens Processing only with a backend', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
  window.history.pushState({}, '', '/processing/j1')
  const { unmount } = render(<App />)
  expect(await screen.findByRole('group', { name: /Γλώσσα|Language/ })).toBeInTheDocument()
  expect(window.location.pathname).toBe('/')
  unmount()

  vi.stubEnv('VITE_API_URL', 'http://api.test')
  const queued = { id: 'j1', title: 'Take', status: 'queued', progress: 0, source: 'file', durationSec: 30, createdAt: '2026-11-09T12:00:00Z' }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(queued), { status: 200 })))
  window.history.pushState({}, '', '/processing/j1')
  render(<App />)
  expect(await screen.findByRole('heading', { name: /Φτιάχνω τη διασκευή σου|Building your arrangement/ })).toBeInTheDocument()
})
