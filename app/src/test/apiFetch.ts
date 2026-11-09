import { vi } from 'vitest'

export const API_URL = 'http://api.test'

type Handler = (init?: RequestInit) => Response

export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// A fetch stand-in routed by "METHOD /path?query"; unrouted calls reject the way a dead network does.
export function apiFetch(routes: Record<string, Handler>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace(API_URL, '')}`
    const handler = routes[key]
    if (!handler) throw new TypeError(`no route for ${key}`)
    return handler(init)
  })
}
