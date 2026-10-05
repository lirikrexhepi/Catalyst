import { launch, openDesktop } from './desktop.mjs'

const browser = await launch()
const { page } = await openDesktop(browser, { scale: 1 })
await page.screenshot({ path: '../scratch/dd-grid.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(900)
await page.screenshot({ path: '../scratch/dd-deck.png' })
console.log(await page.evaluate(() => (window.__calls || []).filter((v, i, a) => a.indexOf(v) === i).join(',')))
await browser.close()
