import type { Messages } from '../i18n/messages'

export function errorText(m: Messages, code: string, message?: string): string {
  const known: Partial<Record<string, string>> = m.apiErrors
  return known[code] ?? message ?? m.apiErrors.fallback
}
