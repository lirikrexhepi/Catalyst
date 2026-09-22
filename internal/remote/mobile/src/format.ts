import { RuntimeEvent } from './types'

export function stripXml(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/<\/?[a-zA-Z][^<>]*>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function summarizeToolInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return stripXml(input).slice(0, 160)
  if (typeof input !== 'object') return String(input).slice(0, 160)
  const obj = input as Record<string, unknown>
  for (const key of ['command', 'cmd', 'pattern', 'path', 'file', 'query', 'prompt', 'text']) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) {
      return stripXml(v).slice(0, 160)
    }
  }
  try {
    return stripXml(JSON.stringify(obj)).slice(0, 160)
  } catch {
    return ''
  }
}

export function cleanOutput(raw: string, limit = 600): string {
  const text = stripXml(raw)
  if (text.length <= limit) return text
  return text.slice(0, limit) + '…'
}

export function isNoiseResult(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t === '' || t === 'done' || t === 'ok' || t === 'success' || t === '{}'
}

// collapseFeed removes back-to-back empty "Done" tool results while keeping
// failures, real output, and the final result of a burst.
export function collapseFeed(events: RuntimeEvent[]): RuntimeEvent[] {
  const out: RuntimeEvent[] = []
  let pendingDone: RuntimeEvent | null = null
  const flush = () => {
    if (pendingDone) {
      out.push(pendingDone)
      pendingDone = null
    }
  }
  for (const ev of events) {
    if (ev.kind === 'tool.result' && isNoiseResult(ev.tool?.output ?? ev.text ?? '')) {
      pendingDone = ev
      continue
    }
    if (ev.kind === 'tool.call' || ev.kind === 'tool.result') {
      flush()
      out.push(ev)
      continue
    }
    flush()
    out.push(ev)
  }
  flush()
  return out
}
