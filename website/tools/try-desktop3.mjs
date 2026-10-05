import { launch, openDesktop } from './desktop.mjs'

const browser = await launch()
const { page } = await openDesktop(browser, { width: 1440, height: 900, scale: 1, storage: { 'composer:wallpaper': 'builtin-4' } })
await page.waitForTimeout(5500)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('Control+ArrowLeft')
  await page.waitForTimeout(120)
}
await page.waitForTimeout(900)
await page.mouse.click(989, 103)
await page.waitForTimeout(900)
await page.screenshot({ path: '../scratch/d3-switcher.png' })
const labels = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim().slice(0, 30)).filter(Boolean))
console.log(labels.join(' | '))
await browser.close()
