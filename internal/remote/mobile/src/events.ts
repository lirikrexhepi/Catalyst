import { RuntimeEvent } from './types'

export function mergeEvents(prev: RuntimeEvent[], incoming: RuntimeEvent | RuntimeEvent[]): RuntimeEvent[] {
  const list = Array.isArray(incoming) ? incoming : [incoming]
  if (list.length === 0) return prev
  let next = [...prev]
  for (const ev of list) {
    if (ev == null) continue
    const last = next[next.length - 1]
    if (
      last &&
      ev.delta &&
      last.kind === ev.kind &&
      (last.turnId ?? '') === (ev.turnId ?? '') &&
      (last.threadId ?? '') === (ev.threadId ?? '')
    ) {
      next[next.length - 1] = { ...last, text: (last.text ?? '') + (ev.text ?? '') }
      continue
    }
    if (typeof ev.seq === 'number' && next.some(e => e.seq === ev.seq && e.kind === ev.kind)) {
      continue
    }
    next.push(ev)
  }
  return next
}

export function isTerminal(kind: string): boolean {
  return kind === 'turn.completed' || kind === 'turn.failed' || kind === 'session.stopped'
}

export function threadRunning(events: RuntimeEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const k = events[i].kind
    if (k === 'turn.started' || k === 'session.started') return true
    if (isTerminal(k)) return false
  }
  return false
}
