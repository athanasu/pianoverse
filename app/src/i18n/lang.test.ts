import { beforeEach, describe, expect, it } from 'vitest'
import { LANG_KEY, detectLang, initialLang, useLang } from './lang'
import { messages } from './messages'

describe('language', () => {
  beforeEach(() => localStorage.clear())

  it('detects Greek devices, defaults everyone else to English', () => {
    expect(detectLang('el-GR')).toBe('el')
    expect(detectLang('EL')).toBe('el')
    expect(detectLang('en-US')).toBe('en')
    expect(detectLang('de-DE')).toBe('en')
    expect(detectLang(undefined)).toBe('en')
  })

  it('prefers the saved choice', () => {
    localStorage.setItem(LANG_KEY, 'el')
    expect(initialLang()).toBe('el')
    localStorage.setItem(LANG_KEY, 'xx')
    expect(['el', 'en']).toContain(initialLang())
  })

  it('setLang persists and updates the document language', () => {
    useLang.getState().setLang('en')
    expect(useLang.getState().lang).toBe('en')
    expect(localStorage.getItem(LANG_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('both languages have the same message keys', () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k],
      )
    expect(keys(messages.en).sort()).toEqual(keys(messages.el).sort())
  })
})
