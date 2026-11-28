import React, { useEffect, useRef } from 'react'

export function MiniLine({ values, color = 'var(--olive)' }) {
  if (!values?.length) return <p className="research-empty">No measured samples yet.</p>
  const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1e-9)
  const points = values.map((value, index) => `${index / Math.max(1, values.length - 1) * 100},${42 - (value - min) / range * 37}`).join(' ')
  return <svg className="research-chart" viewBox="0 0 100 45" preserveAspectRatio="none" role="img" aria-label="Audio feature plot"><polyline points={points} fill="none" stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke" /></svg>
}

export function MelHeatmap({ rows }) {
  const canvas = useRef(null)
  useEffect(() => {
    if (!rows?.length || !canvas.current) return
    const context = canvas.current.getContext('2d')
    const height = rows.length, width = rows[0]?.length ?? 0
    if (!width) return
    const maximum = Math.max(...rows.flat())
    const cellWidth = canvas.current.width / width, cellHeight = canvas.current.height / height
    rows.forEach((row, y) => row.forEach((value, x) => {
      const intensity = Math.max(0, Math.min(1, (value - maximum + 80) / 80))
      context.fillStyle = `hsl(${180 - intensity * 142} 42% ${12 + intensity * 64}%)`
      context.fillRect(x * cellWidth, (height - y - 1) * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight))
    }))
  }, [rows])
  return <canvas ref={canvas} width="560" height="175" className="research-mel" role="img" aria-label="Log-Mel spectrogram computed from uploaded WAV" />
}
