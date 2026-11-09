import { expect, it } from 'vitest'
import { messages } from '../i18n/messages'
import { errorText } from './errorText'

it('translates by code, then falls back to the server message, then to a generic line', () => {
  expect(errorText(messages.el, 'too_short')).toBe('Ο ήχος είναι πολύ μικρός — χρειάζονται τουλάχιστον 10 δευτερόλεπτα.')
  expect(errorText(messages.en, 'silent', 'ignored because the code is known')).toBe("There's nothing to hear in the recording.")
  expect(errorText(messages.en, 'brand_new_code', 'Server says no.')).toBe('Server says no.')
  expect(errorText(messages.el, 'brand_new_code')).toBe('Κάτι πήγε στραβά. Δοκίμασε ξανά.')
})
