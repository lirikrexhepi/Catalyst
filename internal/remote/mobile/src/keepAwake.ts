import { useSyncExternalStore } from 'react'
import { readLocal, writeLocal } from './cache'

const KEY = 'orchestrator_keep_awake'
const listeners = new Set<() => void>()
let enabled = readLocal<boolean>(KEY, true)

export function keepAwakeEnabled(): boolean {
  return enabled
}

export function setKeepAwake(next: boolean) {
  enabled = next
  writeLocal(KEY, next)
  listeners.forEach((l) => l())
}

export function onKeepAwakeChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useKeepAwake(): boolean {
  return useSyncExternalStore(onKeepAwakeChange, () => enabled)
}
