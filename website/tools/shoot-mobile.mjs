import fs from 'node:fs'
import { launch, openMobile } from './mobile.mjs'
import * as S from './story.mjs'

const OUT = '../shots/raw'
fs.mkdirSync(OUT, { recursive: true })
const only = process.argv.slice(2)
const settle = (page, ms = 1100) => page.waitForTimeout(ms)
const thread = (id) => `/t/${id}`
const project = `/p/${encodeURIComponent('C:/code/atlas')}`

const openDrawer = async (page) => {
  await page.evaluate(() => {
    const s = document.querySelector('.shell')
    s.classList.add('settle')
    s.style.setProperty('--p', '1')
  })
  await settle(page, 900)
}

const shots = {
  'chat-live': { hash: thread(S.THREAD_MAIN), scenario: 'live', run: async (page) => settle(page, 1600) },
  'chat-done': { hash: thread(S.THREAD_MAIN), scenario: 'done', run: async (page) => settle(page, 1600) },
  approval: { hash: thread(S.THREAD_ASK), run: async (page) => settle(page, 1600) },
  question: { hash: thread(S.THREAD_QUESTION), run: async (page) => settle(page, 1600) },
  drawer: { hash: thread(S.THREAD_MAIN), run: openDrawer },
  models: {
    hash: thread(S.THREAD_MAIN),
    run: async (page) => {
      await page.tap('[aria-label^="Model:"]')
      await settle(page, 1400)
    },
  },
  files: {
    hash: project,
    run: async (page) => {
      await page.getByText('src', { exact: true }).first().tap()
      await settle(page, 700)
      await page.getByText('settings', { exact: true }).first().tap()
      await settle(page, 900)
    },
  },
  changes: {
    hash: project,
    run: async (page) => {
      await page.getByRole('tab', { name: /^Changes/ }).tap().catch(() => page.getByText(/^Changes/).first().tap())
      await settle(page, 900)
      await page.locator('.seg button', { hasText: /Changes/ }).first().tap().catch(() => {})
      await settle(page, 600)
    },
  },
  diff: {
    hash: project,
    run: async (page) => {
      await page.locator('.seg button', { hasText: /Changes/ }).first().tap()
      await settle(page, 900)
      await page.locator('.change-row', { hasText: 'Appearance.tsx' }).first().tap()
      await settle(page, 1400)
    },
  },
  history: {
    hash: project,
    run: async (page) => {
      await page.locator('.seg button', { hasText: /History/ }).first().tap()
      await settle(page, 1200)
    },
  },
  preview: {
    hash: thread(S.THREAD_MAIN),
    run: async (page) => {
      await page.tap('[aria-label="Preview the site"]')
      await settle(page, 1400)
      await page.screenshot({ path: `${OUT}/mobile-preview-launcher.png` })
      await page.getByText('Atlas').last().tap().catch(() => {})
      await settle(page, 3500)
    },
  },
  settings: {
    hash: thread(S.THREAD_MAIN),
    run: async (page) => {
      await openDrawer(page)
      await page.evaluate(() => document.querySelector('[aria-label="Settings"]').click())
      await settle(page, 1400)
      await page.screenshot({ path: `${OUT}/mobile-settings-sheet.png` })
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /All settings/.test(b.textContent || '')).click())
      await settle(page, 1500)
    },
  },  'chat-light': { hash: thread(S.THREAD_MAIN), scenario: 'done', theme: 'light', run: async (page) => settle(page, 1600) },
  'settings-pc': {
    hash: thread(S.THREAD_MAIN),
    run: async (page) => {
      await openDrawer(page)
      await page.evaluate(() => document.querySelector('[aria-label=\"Settings\"]').click())
      await settle(page, 1200)
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /All settings/.test(b.textContent || '')).click())
      await settle(page, 1400)
      await page.evaluate(() => { const els = [...document.querySelectorAll('.scroll, .settings, .page')]; els.forEach((e) => { e.scrollTop = e.scrollHeight }) })
      await settle(page, 900)
    },
  },
  newchat: {
    hash: '/new',
    run: async (page) => settle(page, 1500),
  },
  auth: { hash: '', unauth: true, run: async (page) => settle(page, 1500) },
}

const browser = await launch()
for (const [name, def] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue
  const { ctx, page } = await openMobile(browser, { hash: def.hash, scenario: def.scenario, unauth: def.unauth, theme: def.theme || 'dark', scale: 3 })
  try {
    await def.run(page)
  } catch (e) {
    console.log(name, 'step failed:', e.message.slice(0, 160))
  }
  await page.screenshot({ path: `${OUT}/mobile-${name}.png` })
  console.log('shot', name)
  await ctx.close()
}
await browser.close()


