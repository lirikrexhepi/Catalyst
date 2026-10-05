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

const open = async (label, file) => {
  await page.mouse.click(989, 103)
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: label }).first().click()
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `../scratch/d4-${file}.png` })
}
await open(/^Changes/, 'changes')
await page.mouse.move(700, 450)
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Chat' }).first().click().catch(() => {})
await page.waitForTimeout(800)
await page.screenshot({ path: '../scratch/d4-back.png' })
await browser.close()
