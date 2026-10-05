import { chromium } from 'playwright-core'
import path from 'node:path'
import os from 'node:os'
const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' })
await page.waitForTimeout(1200)
const go = async (y, name, wait = 1800) => {
  const from = await page.evaluate(() => scrollY)
  for (let k = 1; k <= 8; k++) {
    await page.evaluate((v) => window.scrollTo(0, v), from + ((y - from) * k) / 8)
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `../scratch/review/z-${name}.png` })
}
const phonesTop = await page.evaluate(() => document.querySelector('.phones').offsetTop)
await go(520, 'hero-bottom')
await go(phonesTop + 900 * 0.58 * 2 + 20, 'phones-mid', 2600)
const fan = await page.evaluate(() => document.querySelector('.fan').getBoundingClientRect().top + scrollY)
await go(fan - 220, 'fan', 2200)
await browser.close()
