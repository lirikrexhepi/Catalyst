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

export type ChromeSurface = 'chat' | 'drawer'

const SURFACE_TOKEN: Record<ChromeSurface, string> = { chat: '--chat-bg', drawer: '--drawer-bg' }
let surface: ChromeSurface = 'chat'

function paintChrome() {
  const root = document.documentElement
  root.dataset.surface = surface
  const color = getComputedStyle(root).getPropertyValue(SURFACE_TOKEN[surface]).trim()
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

export function setChromeSurface(next: ChromeSurface) {
  if (next === surface) return
  surface = next
  paintChrome()
}

function apply() {
  const theme = resolved()
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent')
  paintChrome()
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
