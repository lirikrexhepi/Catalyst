import { launch, openDesktop } from './desktop.mjs'

const browser = await launch()
const { page } = await openDesktop(browser, { width: 1440, height: 900, scale: 1 })
await page.waitForTimeout(5500)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('Control+ArrowLeft')
  await page.waitForTimeout(150)
}
await page.waitForTimeout(900)
await page.screenshot({ path: '../scratch/d2-deck0.png' })

const island = page.locator('header, [data-island], .dynamic-island').first()
await page.mouse.move(720, 28)
await page.waitForTimeout(600)
await page.screenshot({ path: '../scratch/d2-island-hover.png' })
await page.mouse.click(720, 28)
await page.waitForTimeout(900)
await page.screenshot({ path: '../scratch/d2-island-click.png' })
await page.keyboard.press('Escape')
await page.mouse.click(100, 450)
await page.waitForTimeout(900)
await page.screenshot({ path: '../scratch/d2-settings.png' })
await browser.close()
