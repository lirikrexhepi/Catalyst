import { chromium } from 'playwright-core'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const exe = path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')
const sites = {
  synara: 'https://www.trysynara.com/',
  clonk: 'https://www.clonk.ai/',
  xbot: 'https://x.ai/bot',
  distill: 'https://distill.id/',
}
const only = process.argv[2]
fs.mkdirSync('../scratch/inspo', { recursive: true })
const browser = await chromium.launch({ executablePath: exe, headless: true })
for (const [name, url] of Object.entries(sites)) {
  if (only && only !== name) continue
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(4000)
    const total = await page.evaluate(() => document.documentElement.scrollHeight)
    console.log(name, 'height', total)
    const slices = Math.min(14, Math.ceil(total / 900))
    for (let i = 0; i < slices; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 900)
      await page.waitForTimeout(900)
      await page.screenshot({ path: `../scratch/inspo/${name}-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 })
    }
  } catch (e) {
    console.log(name, 'failed', e.message.slice(0, 120))
  }
  await ctx.close()
}
await browser.close()
