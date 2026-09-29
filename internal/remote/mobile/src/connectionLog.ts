import { useSyncExternalStore } from 'react'
import { readLocal, writeLocal } from './cache'
import { logPhone } from './phoneLogger'

export interface LogEntry {
  at: number
  text: string
}

const KEY = 'orchestrator_connection_log'
const LIMIT = 60
const listeners = new Set<() => void>()
let entries: LogEntry[] = readLocal<LogEntry[]>(KEY, [])

export function logConnection(text: string) {
  const last = entries[entries.length - 1]
  if (last && last.text === text && Date.now() - last.at < 5000) return
  entries = [...entries, { at: Date.now(), text }].slice(-LIMIT)
  writeLocal(KEY, entries)
  listeners.forEach((l) => l())

  const isWarn = /lost|couldn't|error|failed|closed/i.test(text)
  logPhone(isWarn ? 'warn' : 'info', text)
}

export function clearConnectionLog() {
  entries = []
  writeLocal(KEY, entries)
  listeners.forEach((l) => l())
}

export function useConnectionLog(): LogEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => entries,
  )
}
