import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => vi.unstubAllGlobals())

it('opens on the library', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })))
  render(<App />)
  expect(screen.getByText('Pianoverse')).toBeInTheDocument()
  expect(await screen.findByRole('group', { name: /Γλώσσα|Language/ })).toBeInTheDocument()
})
