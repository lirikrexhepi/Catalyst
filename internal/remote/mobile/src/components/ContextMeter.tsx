import React from 'react'

function short(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export default function ContextMeter({ usage }: { usage?: { tokens: number; window?: number } }) {
  if (!usage || usage.tokens <= 0) return null
  const ratio = usage.window ? Math.min(1, usage.tokens / usage.window) : undefined
  const size = 12
  const r = 4.5
  const c = 2 * Math.PI * r
  const tone = ratio === undefined ? '' : ratio >= 0.9 ? ' hot' : ratio >= 0.75 ? ' warm' : ''
  const label = ratio !== undefined ? `${Math.round(ratio * 100)}%` : short(usage.tokens)
  const aria = usage.window
    ? `${usage.tokens.toLocaleString()} of ${usage.window.toLocaleString()} context tokens used`
    : `${usage.tokens.toLocaleString()} context tokens used`
  return (
    <span className={`ctx-meter${tone}`} role="img" aria-label={aria}>
      {' · '}
      {ratio !== undefined && (
        <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.8" />
          <circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} transform="rotate(-90 6 6)" />
        </svg>
      )}
      {label}
    </span>
  )
}
