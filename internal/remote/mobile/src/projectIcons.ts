import { useSyncExternalStore } from 'react'
import { readLocal, writeLocal } from './cache'

const KEY = 'orchestrator_show_project_favicons'
const listeners = new Set<() => void>()
let show: boolean = readLocal<boolean>(KEY, false)

export function setShowProjectFavicons(next: boolean) {
  show = next
  writeLocal(KEY, next)
  listeners.forEach((l) => l())
}

export function useShowProjectFavicons(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => show,
  )
}
