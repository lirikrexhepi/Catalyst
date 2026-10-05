import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright-core'
import * as S from './story.mjs'

export const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
export const MOBILE_URL = 'http://localhost:5199/'

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

const eventsFor = (id, scenario) => {
  if (id === S.THREAD_MAIN) return scenario === 'long' ? S.mainEvents() : S.phoneEvents(scenario === 'live')
  if (id === S.THREAD_ASK) return S.askEvents()
  if (id === S.THREAD_QUESTION) return S.questionEvents()
  return []
}

export async function launch() {
  return chromium.launch({ executablePath: exe, headless: true })
}

export async function openMobile(browser, { hash = '', theme = 'dark', width = 390, height = 844, scale = 3, storage = {}, scenario = 'done', unauth = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  })
  await ctx.addInitScript(
    ({ storage, theme }) => {
      localStorage.setItem('composer_remote_token', 'demo')
      localStorage.setItem('orchestrator_theme', theme)
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
      class FakeSocket extends EventTarget {
        constructor() {
          super()
          this.readyState = 0
          setTimeout(() => {
            this.readyState = 1
            this.onopen && this.onopen({})
          }, 30)
        }
        send() {}
        close() {
          this.readyState = 3
        }
      }
      FakeSocket.OPEN = 1
      FakeSocket.CONNECTING = 0
      FakeSocket.CLOSED = 3
      window.WebSocket = FakeSocket
    },
    { storage, theme },
  )
  await ctx.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    const q = url.searchParams
    if (p === '/api/status') return json(route, { authenticated: !unauth, canPowerOff: true })
    if (p === '/api/preview/start') return json(route, { port: 5317, url: 'http://127.0.0.1:5317/settings.html', state: 'live' })
    if (p === '/api/threads') return json(route, S.summaries)
    if (p.startsWith('/api/thread/')) {
      const id = decodeURIComponent(p.slice('/api/thread/'.length))
      const events = eventsFor(id, scenario)
      return json(route, { events, lastSeq: events.length })
    }
    if (p === '/api/projects') return json(route, S.projects)
    if (p === '/api/models') return json(route, S.providers)
    if (p === '/api/servers') return json(route, S.servers)
    if (p === '/api/pc/monitors') return json(route, { supported: true, count: 2, off: false, autoOff: true })
    if (p === '/api/pc/diagnostics')
      return json(route, { headless: false, port: 4545, publicUrl: 'https://studio-pc.tail4f2a.ts.net', connecting: false, clients: 1, tailscale: true, cloudflared: false, log: [] })
    if (p === '/api/pc/stats')
      return json(route, { cpuPercent: 23, cpuCores: 16, memoryUsedBytes: 21_474_836_480, memoryTotalBytes: 68_719_476_736, memoryPercent: 31, uptimeSeconds: 266_400 })
    if (p === '/api/git/overview') return json(route, S.checkouts)
    if (p === '/api/git/diff') return json(route, S.diffFile)
    if (p === '/api/git/commit') return json(route, [S.diffFile])
    if (p === '/api/tree/status') return json(route, S.treeStatus)
    if (p === '/api/tree') return json(route, S.tree[q.get('dir') || ''] || [])
    if (p === '/api/file')
      return json(route, { path: q.get('path'), size: 700, binary: false, truncated: false, text: "import { useEffect, useState } from 'react'\nimport { themes, type Theme } from './theme'\n\nconst KEY = 'atlas-theme'\n\nexport function useTheme() {\n  const [theme, setTheme] = useState<Theme>(() => {\n    const saved = localStorage.getItem(KEY)\n    return themes.includes(saved as Theme) ? (saved as Theme) : 'light'\n  })\n\n  useEffect(() => {\n    document.documentElement.dataset.theme = theme\n    localStorage.setItem(KEY, theme)\n  }, [theme])\n\n  return [theme, setTheme] as const\n}\n" })
    if (p === '/api/folders') return json(route, { places: [{ name: 'Code', path: 'C:/code' }, { name: 'Documents', path: 'C:/Users/studio/Documents' }, { name: 'Desktop', path: 'C:/Users/studio/Desktop' }] })
    if (p === '/api/project/icon') return route.fulfill({ status: 404, body: '' })
    if (p === '/api/push/key') return json(route, {}, 404)
    return json(route, { ok: true })
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)))
  await page.goto(MOBILE_URL + (hash ? '#' + hash : ''), { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  return { ctx, page }
}

