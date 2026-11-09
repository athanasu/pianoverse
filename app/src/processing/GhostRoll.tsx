// Note positions from the approved mockup, measured on its 342 px wide roll.
const NOTES = [
  [14, 20, 40], [34, 70, 30], [58, 10, 50], [80, 60, 44], [104, 30, 24], [128, 84, 38], [150, 14, 46],
  [176, 56, 52], [200, 24, 30], [222, 90, 36], [246, 40, 44], [270, 8, 30], [292, 70, 40], [316, 30, 50],
] as const
const WIDTH = 342

export function GhostRoll({ progress }: { progress: number }) {
  const line = Math.min(1, Math.max(0.04, progress))
  return (
    <div className="ghost-roll" aria-hidden="true">
      {NOTES.map(([x, y, h], i) => (
        <span
          key={i}
          className={`ghost-note ${i % 3 === 0 ? 'left' : 'right'}${x / WIDTH < line ? ' lit' : ''}`}
          style={{ left: `${(x / WIDTH) * 100}%`, top: y, height: h }}
        />
      ))}
      <span className="ghost-line" style={{ width: `${line * 100}%` }} />
    </div>
  )
}
