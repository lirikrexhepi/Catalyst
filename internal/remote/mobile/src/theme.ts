import { useSyncExternalStore } from 'react'
import { readLocal, writeLocal } from './cache'

export type ThemePref = 'dark' | 'light' | 'auto'

const KEY = 'orchestrator_theme'
const listeners = new Set<() => void>()
let pref: ThemePref = readLocal<ThemePref>(KEY, 'dark')
const lightQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

function resolved(): 'dark' | 'light' {
  if (pref === 'auto') return lightQuery?.matches ? 'light' : 'dark'
  return pref
}

function apply() {
  const theme = resolved()
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f2f4' : '#111111')
}

export function initTheme() {
  apply()
  lightQuery?.addEventListener('change', () => {
    if (pref === 'auto') apply()
  })
}

export function setThemePref(next: ThemePref) {
  pref = next
  writeLocal(KEY, next)
  apply()
  listeners.forEach((l) => l())
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
  )
}
