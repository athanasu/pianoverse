import { create } from 'zustand'
import type { Hand, Level } from '../song/types'
import type { Loop } from './types'

export const SPEEDS = [0.25, 0.5, 0.75, 1]

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
  cycleSpeed: () => void
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
  cycleSpeed: () => set({ speed: SPEEDS[(SPEEDS.indexOf(get().speed) + 1) % SPEEDS.length] }),
  setLoop: (loop) => set({ loop }),
  toggleNames: () => set({ names: !get().names }),
  toggleCard: () => set({ card: !get().card }),
}))
