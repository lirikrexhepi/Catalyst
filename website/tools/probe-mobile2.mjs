import { launch, openMobile } from './mobile.mjs'
import * as S from './story.mjs'
const browser = await launch()
const { page } = await openMobile(browser, { hash: `/t/${S.THREAD_MAIN}`, scale: 1 })
await page.evaluate(() => {
  const s = document.querySelector('.shell')
  s.classList.add('settle')
  s.style.setProperty('--p', '1')
})
await page.waitForTimeout(800)
await page.evaluate(() => document.querySelector('[aria-label="Settings"]').click())
await page.waitForTimeout(1200)
await page.screenshot({ path: '../scratch/mp-settings1.png' })
console.log(await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)).filter(Boolean).slice(-14).join(' | ')))
await browser.close()
