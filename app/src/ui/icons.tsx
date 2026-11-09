const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const ChevronLeft = () => <svg {...base}><path d="M15 18l-6-6 6-6" /></svg>
export const Keys = () => <svg {...base} strokeWidth={1.8}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5v8M12 5v14M16 5v8" /></svg>
export const LoopIcon = () => <svg {...base} width={20} height={20} strokeWidth={1.8}><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
export const Plus = () => <svg {...base} width={20} height={20}><path d="M12 5v14M5 12h14" /></svg>
export const Alert = () => <svg {...base} width={16} height={16} strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
export const PlayIcon = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
export const PauseIcon = () => <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
export const Close = () => <svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const AudioFile = () => <svg {...base} width={26} height={26} strokeWidth={1.8}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><circle cx="10" cy="16" r="2" /><path d="M12 16v-5l3 1" /></svg>
export const MicOff = () => <svg {...base} width={26} height={26} strokeWidth={1.8}><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8" /><path d="M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 11.3 5.5M12 18v3" /><path d="M3 3l18 18" /></svg>
