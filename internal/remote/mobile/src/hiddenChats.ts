import { useSyncExternalStore } from 'react'

const KEY = 'orchestrator_hidden_chats'
const listeners = new Set<() => void>()

function read(): ReadonlySet<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

let hidden: ReadonlySet<string> = read()

function write(next: Set<string>) {
  hidden = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    return
  } finally {
    listeners.forEach((l) => l())
  }
}

export function hideChat(threadId: string) {
  const next = new Set(hidden)
  next.add(threadId)
  write(next)
}

export function showAllChats() {
  write(new Set())
}

export function useHiddenChats(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => hidden,
  )
}
