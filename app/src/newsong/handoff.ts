// A file chosen on another screen, waiting for the New song screen to pick it up.
// Kept in memory because a File cannot travel through the URL or survive a reload anyway.
let pending: File | null = null

export function handOff(file: File): void {
  pending = file
}

export function peekHandOff(): File | null {
  return pending
}

export function takeHandOff(): File | null {
  const file = pending
  pending = null
  return file
}
