import { create } from 'zustand'
import { messages, type Lang, type Messages } from './messages'

export type { Lang } from './messages'

export const LANG_KEY = 'pianoverse.lang'

export function detectLang(navigatorLanguage: string | undefined): Lang {
  return navigatorLanguage?.toLowerCase().startsWith('el') ? 'el' : 'en'
}

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'el' || saved === 'en') return saved
  } catch {
    // storage blocked: fall back to the device language
  }
  return detectLang(typeof navigator === 'undefined' ? undefined : navigator.language)
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // storage blocked: the choice lasts for this session only
    }
    document.documentElement.lang = lang
    set({ lang })
  },
}))

export function useMessages(): Messages {
  return messages[useLang((s) => s.lang)]
}
