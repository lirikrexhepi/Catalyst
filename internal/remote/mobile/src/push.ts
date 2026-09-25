import { api, type PushPrefs } from './api'
import { readLocal, writeLocal } from './cache'

const PREFS_KEY = 'orchestrator_push_prefs'

export const defaultPrefs: PushPrefs = { attention: true, finished: true, away: true }

export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

export function pushSupport(): PushSupport {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis && window.isSecureContext) return 'supported'
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  if (ios && !standalone) return 'needs-install'
  return 'unsupported'
}

export function loadPrefs(): PushPrefs {
  return { ...defaultPrefs, ...readLocal<Partial<PushPrefs>>(PREFS_KEY, {}) }
}

function savePrefs(prefs: PushPrefs) {
  writeLocal(PREFS_KEY, prefs)
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  try {
    return await (await registration()).pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function enablePush(prefs: PushPrefs): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed')
  const reg = await registration()
  const { publicKey } = await api.pushKey()
  let sub = await reg.pushManager.getSubscription()
  const current = sub?.options.applicationServerKey
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  }
  await api.pushSubscribe(sub.toJSON(), prefs)
  savePrefs(prefs)
  return sub
}

export async function updatePrefs(prefs: PushPrefs) {
  savePrefs(prefs)
  const sub = await currentSubscription()
  if (sub) await api.pushSubscribe(sub.toJSON(), prefs)
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (!sub) return
  try {
    await api.pushUnsubscribe(sub.endpoint)
  } finally {
    await sub.unsubscribe()
  }
}

export async function sendTest() {
  const sub = await currentSubscription()
  if (!sub) throw new Error('Notifications are off')
  await api.pushTest(sub.endpoint)
}

export async function resyncPush() {
  if (Notification.permission !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await api.pushSubscribe(sub.toJSON(), loadPrefs()).catch(() => undefined)
}

export function setBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined)
    else void nav.clearAppBadge?.()?.catch(() => undefined)
  } catch {
    return
  }
}
