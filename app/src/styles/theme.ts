export const THEME = {
  bg: '#0A0C14',
  surface: '#141927',
  surface2: '#10141F',
  roll: '#0D101A',
  line: '#242B3E',
  lineSoft: '#1E2436',
  lineStrong: '#2C3448',
  chip: '#1A2033',
  controlOn: '#1E2538',
  text: '#EEF1F8',
  muted: '#97A0B8',
  textSoft: '#C9CFDD',
  success: '#7FD6A4',
  track: '#232A3D',
  idle: '#3A4258',
  left: '#4D8DFF',
  leftHi: '#7FAEFF',
  leftGlow: 'rgba(77,141,255,0.65)',
  leftInk: '#081633',
  right: '#FFA94D',
  rightHi: '#FFC688',
  rightGlow: 'rgba(255,169,77,0.65)',
  rightInk: '#3A2105',
  onAccent: '#2A1704',
  keyWhite: '#E8EBF2',
  keyEdge: '#9AA3B8',
  keyBlack: '#121520',
  keyLabel: '#6B7489',
  lane: 'rgba(255,255,255,0.035)',
  beat: 'rgba(255,255,255,0.06)',
  bar: 'rgba(255,255,255,0.13)',
  hit: '#FFFFFF',
  hitGlow: 'rgba(255,255,255,0.55)',
  fontBody: "'Inter', system-ui, sans-serif",
  fontDisplay: "'Space Grotesk', 'Inter', sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, monospace",
} as const

const kebab = (key: string) => key.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`)

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(THEME)) root.style.setProperty(`--${kebab(key)}`, value)
}
