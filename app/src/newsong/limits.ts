// The server's upload limits (engine: server/config.py and audio.py), checked here first
// so a file that can never be accepted is refused before it is uploaded.
export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MIN_AUDIO_SEC = 10
export const MAX_AUDIO_SEC = 480

export type FileProblem = 'not_audio' | 'too_large' | 'too_short' | 'too_long'

// Browsers leave the type empty, or generic, for audio formats they do not know; those go to the server.
const maybeAudio = (type: string) => type === '' || /^(audio|video)\//.test(type) || type === 'application/ogg' || type === 'application/octet-stream'

export function fileProblem(file: File, durationSec: number | null): FileProblem | null {
  if (!maybeAudio(file.type)) return 'not_audio'
  if (file.size > MAX_FILE_BYTES) return 'too_large'
  if (durationSec !== null && durationSec < MIN_AUDIO_SEC) return 'too_short'
  if (durationSec !== null && durationSec > MAX_AUDIO_SEC) return 'too_long'
  return null
}
