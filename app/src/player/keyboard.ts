const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const pc = (p: number) => ((p % 12) + 12) % 12

export const isBlack = (p: number): boolean => !WHITE_PCS.includes(pc(p))

export interface KeyRect { pitch: number; black: boolean; x: number; w: number }
export interface KeyboardLayout { lo: number; hi: number; whites: KeyRect[]; blacks: KeyRect[]; byPitch: Map<number, KeyRect> }

export function keyboardRange(pitches: number[], minOctaves = 2): [number, number] {
  if (pitches.length === 0) return [48, 83]
  let lo = pitches.reduce((a, b) => Math.min(a, b))
  let hi = pitches.reduce((a, b) => Math.max(a, b))
  lo -= pc(lo)
  hi += 11 - pc(hi)
  while (hi - lo + 1 < minOctaves * 12) {
    if (lo - 12 >= 21) lo -= 12
    else hi += 12
  }
  return [Math.max(21, lo), Math.min(108, hi)]
}

export function layoutKeyboard(lo: number, hi: number, width: number): KeyboardLayout {
  const whitePitches: number[] = []
  for (let p = lo; p <= hi; p++) if (!isBlack(p)) whitePitches.push(p)
  const kw = width / Math.max(1, whitePitches.length)
  const bw = kw * 0.58
  const byPitch = new Map<number, KeyRect>()
  const whites = whitePitches.map((pitch, i) => {
    const key = { pitch, black: false, x: i * kw, w: kw }
    byPitch.set(pitch, key)
    return key
  })
  const blacks: KeyRect[] = []
  for (let p = lo; p <= hi; p++) {
    if (!isBlack(p)) continue
    const left = byPitch.get(p - 1)
    if (!left) continue
    const key = { pitch: p, black: true, x: left.x + kw - bw / 2, w: bw }
    byPitch.set(p, key)
    blacks.push(key)
  }
  return { lo, hi, whites, blacks, byPitch }
}
