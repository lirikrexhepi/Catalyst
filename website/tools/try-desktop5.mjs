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

const mode = async (label, file) => {
  await page.getByRole('button', { name: 'Views' }).first().click()
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: label }).first().click()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `../scratch/d5-${file}.png` })
}
await mode(/^Preview/, 'preview')
await mode(/^Servers/, 'servers')
await page.getByRole('button', { name: 'Views' }).first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /^Chat/ }).first().click()
await page.waitForTimeout(600)
await page.mouse.click(46, 450)
await page.waitForTimeout(1200)
await page.screenshot({ path: '../scratch/d5-settings.png' })
await page.keyboard.press('Escape')
await page.mouse.click(720, 28)
await page.waitForTimeout(400)
await page.mouse.move(800, 30)
await page.waitForTimeout(800)
await page.screenshot({ path: '../scratch/d5-island.png' })
await browser.close()
