import { create } from 'zustand'
import type { Hand, Level } from '../song/types'
import type { Loop } from './types'

// Speed is chosen in whole percent of the original tempo, so steps never drift off round values.
export const SPEED_MIN = 25
export const SPEED_MAX = 200
export const SPEED_STEP = 5
export const SPEED_PRESETS = [25, 50, 75, 100, 125, 150]

export const speedPercent = (speed: number) => Math.round(speed * 100)

function snapSpeed(percent: number): number {
  const snapped = Math.round(percent / SPEED_STEP) * SPEED_STEP
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, snapped)) / 100
}

interface PlayerState {
  level: Level
  hands: { L: boolean; R: boolean }
  speed: number
  loop: Loop | null
  names: boolean
  card: boolean
  reset: (levels: Level[]) => void
  setLevel: (level: Level) => void
  toggleHand: (hand: Hand) => void
  setSpeedPercent: (percent: number) => void
  stepSpeed: (direction: 1 | -1) => void
  setLoop: (loop: Loop | null) => void
  toggleNames: () => void
  toggleCard: () => void
}

export const usePlayer = create<PlayerState>((set, get) => ({
  level: 'medium',
  hands: { L: true, R: true },
  speed: 1,
  loop: null,
  names: false,
  card: true,
  reset: (levels) => set({ level: levels.includes('medium') ? 'medium' : (levels[0] ?? 'medium'), loop: null }),
  setLevel: (level) => set({ level }),
  toggleHand: (hand) => set({ hands: { ...get().hands, [hand]: !get().hands[hand] } }),
  setSpeedPercent: (percent) => set({ speed: snapSpeed(percent) }),
  stepSpeed: (direction) => set({ speed: snapSpeed(speedPercent(get().speed) + direction * SPEED_STEP) }),
  setLoop: (loop) => set({ loop }),
  toggleNames: () => set({ names: !get().names }),
  toggleCard: () => set({ card: !get().card }),
}))
