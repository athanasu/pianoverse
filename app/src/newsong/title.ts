import { messages, type Lang } from '../i18n/messages'

export type TitleSource = { kind: 'file'; name: string } | { kind: 'recording'; at: Date }

const LOCALE: Record<Lang, string> = { el: 'el-GR', en: 'en-US' }

export function defaultTitle(source: TitleSource, lang: Lang): string {
  if (source.kind === 'file') return source.name.replace(/\.[^.]+$/, '').trim() || source.name
  const locale = LOCALE[lang]
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(source.at)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(source.at)
  return `${messages[lang].newSong.recordingTitle} ${day}, ${time}`
}
