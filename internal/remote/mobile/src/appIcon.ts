import { useSyncExternalStore } from 'react'
import { readLocal, writeLocal } from './cache'
import { APP_ICONS, DEFAULT_APP_ICON, appIconSrc } from './appIcons'

const KEY = 'orchestrator_app_icon'
const listeners = new Set<() => void>()

function valid(id: unknown): id is string {
  return typeof id === 'string' && APP_ICONS.some((icon) => icon.id === id)
}

let current: string = (() => {
  const stored = readLocal<string>(KEY, DEFAULT_APP_ICON)
  return valid(stored) ? stored : DEFAULT_APP_ICON
})()

let manifestUrl: string | null = null

function setLink(selector: string, href: string) {
  const el = document.querySelector<HTMLLinkElement>(selector)
  if (el) el.href = href
}

function applyToDom(id: string) {
  if (typeof document === 'undefined') return
  const src = appIconSrc(id)
  setLink('link[rel="icon"][sizes="192x192"]', src)
  setLink('link[rel="apple-touch-icon"]', src)
  try {
    const absolute = new URL(src, window.location.origin).href
    const manifest = {
      name: 'Orchestrator',
      short_name: 'Orchestrator',
      theme_color: '#111111',
      background_color: '#111111',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: absolute, sizes: '192x192', type: 'image/png' },
        { src: absolute, sizes: '512x512', type: 'image/png' },
        { src: absolute, sizes: '180x180', type: 'image/png' },
      ],
    }
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' })
    const next = URL.createObjectURL(blob)
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (link) link.href = next
    if (manifestUrl) URL.revokeObjectURL(manifestUrl)
    manifestUrl = next
  } catch { /* keep static manifest */ }
}

export function getAppIcon(): string {
  return current
}

export function useAppIcon(): string {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => current,
  )
}

export function setAppIcon(id: string) {
  if (!valid(id) || id === current) return
  current = id
  writeLocal(KEY, id)
  applyToDom(id)
  listeners.forEach((l) => l())
}

export function initAppIcon() {
  applyToDom(current)
}
