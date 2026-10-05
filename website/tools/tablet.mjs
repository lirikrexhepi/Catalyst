import { chromium } from 'playwright-core'
import path from 'node:path'
import os from 'node:os'

const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext({ viewport: { width: 820, height: 1100 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.screenshot({ path: '../scratch/review/tablet-0.jpg', type: 'jpeg', quality: 70 })
console.log('horizontal overflow at 820:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
await browser.close()
