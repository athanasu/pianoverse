import { describe, expect, it } from 'vitest'
import { THEME, applyTheme } from './theme'

describe('applyTheme', () => {
  it('exposes every theme value as a kebab-case CSS variable', () => {
    const el = document.createElement('div')
    applyTheme(el)
    expect(el.style.getPropertyValue('--left')).toBe(THEME.left)
    expect(el.style.getPropertyValue('--left-hi')).toBe(THEME.leftHi)
    expect(el.style.getPropertyValue('--surface-2')).toBe(THEME.surface2)
    expect(el.style.getPropertyValue('--font-display')).toBe(THEME.fontDisplay)
    expect(el.style.getPropertyValue('--text-soft')).toBe(THEME.textSoft)
    expect(el.style.getPropertyValue('--success')).toBe(THEME.success)
  })
})
