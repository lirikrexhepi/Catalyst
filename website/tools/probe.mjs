import { chromium } from 'playwright-core'
import path from 'node:path'
import os from 'node:os'

const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const [url, out, w = '390', h = '844', scale = '2'] = process.argv.slice(2)

const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: +scale,
  isMobile: +w < 700,
  hasTouch: +w < 700,
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300))
})
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 300)))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(2500)
await page.screenshot({ path: out })
await browser.close()
