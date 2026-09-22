import { useEffect, useState } from 'react'
import { elapsed } from '../format'

/** Live running time since `since`, ticking once a second. */
export default function Elapsed({ since, className = 'timer' }: { since?: number; className?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [since])
  if (!since) return null
  return (
    <span className={className} aria-label={`Working for ${elapsed(now - since)}`}>
      {elapsed(now - since)}
    </span>
  )
}
