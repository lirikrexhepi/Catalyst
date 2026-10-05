import { chromium } from 'playwright-core'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const [mode = 'desktop', ...rest] = process.argv.slice(2)
const url = 'http://127.0.0.1:4173/'
const dir = '../scratch/review'
fs.mkdirSync(dir, { recursive: true })

const sizes = { desktop: { width: 1440, height: 900, dsf: 1, mobile: false }, mobile: { width: 390, height: 844, dsf: 2, mobile: true } }
const s = sizes[mode]
const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dsf, isMobile: s.mobile, hasTouch: s.mobile })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})
page.on('requestfailed', (r) => errors.push('failed: ' + r.url()))
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1500)

const total = await page.evaluate(() => document.documentElement.scrollHeight)
const vh = s.height
console.log('page height', total, 'viewports', (total / vh).toFixed(1))
const positions = rest.length ? rest.map(Number) : Array.from({ length: Math.ceil(total / vh) }, (_, i) => i * vh)
let i = 0
for (const y of positions) {
  const steps = 6
  const from = await page.evaluate(() => scrollY)
  for (let k = 1; k <= steps; k++) {
    await page.evaluate((v) => window.scrollTo(0, v), from + ((y - from) * k) / steps)
    await page.waitForTimeout(90)
  }
  await page.waitForTimeout(1300)
  await page.screenshot({ path: `${dir}/${mode}-${String(i++).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 72 })
}
console.log(errors.length ? errors.join('\n') : 'no errors')
await browser.close()
