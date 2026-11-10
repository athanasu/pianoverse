import { useEffect, useRef, useState } from 'react'

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Lets a file be dropped anywhere on the page. Returns true while a file is dragged over the window.
 * File drags are always swallowed, so a stray drop never makes the browser leave the app.
 */
export function useFileDrop(onFile: (file: File) => void, enabled = true): boolean {
  const [dragging, setDragging] = useState(false)
  const latest = useRef({ onFile, enabled })
  useEffect(() => {
    latest.current = { onFile, enabled }
  })

  useEffect(() => {
    // dragenter and dragleave fire for every element crossed, so the depth tells when the window is left.
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth += 1
      if (latest.current.enabled) setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = latest.current.enabled ? 'copy' : 'none'
    }
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (!latest.current.enabled) return
      const files = Array.from(e.dataTransfer?.files ?? [])
      const file = files.find((f) => f.type.startsWith('audio/')) ?? files[0]
      if (file) latest.current.onFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging && enabled
}
