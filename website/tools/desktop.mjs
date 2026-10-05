import { chromium } from 'playwright-core'
import path from 'node:path'
import os from 'node:os'
import * as D from './desk-story.mjs'

export const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
export const DESKTOP_URL = 'http://127.0.0.1:9245/'

const injected = (data) => {
  const listeners = new Map()
  const resolved = (v) => Promise.resolve(v)
  const handlers = {
    ListProjects: () => data.projects,
    ActiveProject: () => data.projects[0],
    SelectProject: (id) => data.projects.find((p) => p.id === id) || data.projects[0],
    ListProviders: () => data.providers,
    ListHistory: () => data.history,
    GetAllUserPreferences: () => ({}),
    GetUserPreference: () => '',
    GetBackgroundSettings: () => ({ startMode: 'normal', keepRunningOnClose: false, supported: true, exePath: '' }),
    GetRemoteInfo: () => data.remote,
    UsageReport: () => data.usage,
    RefreshUsage: () => data.usage,
    ListServers: () => data.servers,
    ListManagedServers: () => [],
    GitOverview: () => data.worktrees,
    GitBranches: () => [
      { name: 'main', current: true, remote: false },
      { name: 'agent/dark-mode', current: false, remote: false },
      { name: 'agent/uuid-keys', current: false, remote: false },
      { name: 'origin/main', current: false, remote: true },
    ],
    GitFileDiff: (wt, file) => (String(file).includes('useTheme') ? data.diffNew : data.diffFile),
    GitCommitDiff: () => [data.diffFile],
    ClaudeUpdateStatus: () => ({ installed: '2.1.289', latest: '2.1.289', available: false, checkedAt: Date.now() }),
    ListAccounts: (driver) => (driver === 'claude' ? [{ id: 'personal', name: 'Personal' }, { id: 'studio', name: 'Studio' }] : []),
    AccountStatus: () => ({ signedIn: true, known: true }),
    ListSkills: () => [],
    ListSlashCommands: () => [],
    GetAppIcon: () => 'blue-base',
    IsGitRepo: () => true,
    IsProviderEnabled: () => true,
    ProjectIcon: () => '',
    OrchestratorAuto: () => false,
    OrchestratorLatest: () => null,
    OrchestratorAgents: () => [],
    CoordinatorHistory: () => data.coordinator || [],
    ListSessions: () => [],
    ListSessionsMeta: () => [],
    ListClaudeCodeSessions: () => [],
    GetAgentTasks: () => [],
    WorkspaceTasks: () => [],
    GetSessionTasks: () => [],
    ThreadHistory: () => [],
    ContextStatus: () => ({}),
    GetProviderSettings: () => ({ enabled: true }),
    ProjectTree: () => [],
    ProjectTreeStatus: () => ({ isGit: true, files: {}, dirs: {} }),
    WindowIsMaximised: () => false,
    WindowIsFullscreen: () => false,
  }
  window.go = {
    main: {
      App: new Proxy(
        {},
        {
          get:
            (_, name) =>
            (...args) => {
              const h = data.overrides?.[name] ? () => data.overrides[name](...args) : handlers[name]
              if (typeof name === 'string') (window.__calls = window.__calls || []).push(name)
              return resolved(h ? h(...args) : null)
            },
        },
      ),
    },
  }
  const on = (name, cb) => {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name).add(cb)
    return () => listeners.get(name)?.delete(cb)
  }
  window.runtime = new Proxy(
    {
      EventsOnMultiple: (name, cb) => on(name, cb),
      EventsOff: () => {},
      EventsOffAll: () => {},
      EventsEmit: () => {},
      Environment: () => resolved({ buildType: 'production', platform: 'windows', arch: 'amd64' }),
      WindowIsMaximised: () => resolved(false),
      WindowIsFullscreen: () => resolved(false),
      WindowGetSize: () => resolved({ w: window.innerWidth, h: window.innerHeight }),
      ScreenGetAll: () => resolved([]),
    },
    { get: (t, k) => (k in t ? t[k] : () => resolved(null)) },
  )
  window.__emit = (name, payload) => {
    for (const cb of listeners.get(name) || []) cb(payload)
  }
}

export async function launch() {
  return chromium.launch({ executablePath: exe, headless: true })
}

const qrSvg = (size = 29) => {
  let seed = 7
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const cells = []
  const finder = (x, y) => x < 8 && y < 8 ? [0, 0] : x >= size - 8 && y < 8 ? [size - 7, 0] : x < 8 && y >= size - 8 ? [0, size - 7] : null
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = finder(x, y)
      let on
      if (f) {
        const dx = x - f[0]
        const dy = y - f[1]
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) on = false
        else on = dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
      } else on = rnd() > 0.52
      if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${size + 2} ${size + 2}" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${size + 2}" height="${size + 2}" fill="#fff"/><g fill="#000">${cells.join('')}</g></svg>`
}

export const demoData = () => ({
  projects: D.projects,
  providers: D.providers,
  history: D.history,
  usage: D.usage,
  servers: [
    {
      threadId: D.THREADS.dark,
      title: 'Add a dark mode toggle',
      servers: [
        { pid: 4120, port: 5317, address: '127.0.0.1', name: 'Atlas', command: 'vite', kind: 'vite', ownerThreadId: D.THREADS.dark, ours: true, cwd: 'C:/code/atlas-wt/dark-mode' },
      ],
    },
  ],
  worktrees: D.worktrees,
  diffFile: D.diffFile,
  diffNew: D.diffNew,
  coordinator: D.coordinatorEvents(),
  remote: {
    enabled: true,
    port: 4545,
    token: 'a41f0c9e7b2d4a6f8c15e03b9d7e2f64',
    pin: '482 913',
    localUrl: 'http://192.168.1.24:4545',
    tailscaleUrl: 'https://studio-pc.tail4f2a.ts.net',
    publicUrl: '',
    bestUrl: 'https://studio-pc.tail4f2a.ts.net/?token=a41f0c9e7b2d4a6f8c15e03b9d7e2f64',
    qrCodeSvg: qrSvg(),
    activeClients: 1,
    hostname: 'studio-pc',
    lanIps: ['192.168.1.24'],
    connecting: false,
    downloading: false,
  },
})

export async function openDesktop(browser, { width = 1600, height = 1000, scale = 2, storage = {}, overrides, theme = 'dark', populate = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: theme })
  const data = demoData()
  await ctx.addInitScript(
    ({ storage }) => {
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))
    },
    { storage },
  )
  await ctx.addInitScript(injected, data)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 240)))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('console:', m.text().slice(0, 240))
  })
  await page.goto(DESKTOP_URL, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  if (populate) {
    await page.evaluate((r) => window.__emit('orchestrator:spawned', r), D.spawnResult)
    await page.waitForTimeout(400)
    const batches = D.allEvents()
    for (const batch of batches) {
      await page.evaluate((b) => window.__emit('agent:events', b), batch)
    }
    await page.waitForTimeout(1200)
  }
  return { ctx, page }
}

