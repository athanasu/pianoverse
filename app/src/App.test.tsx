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
