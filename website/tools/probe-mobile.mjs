import { launch, openMobile } from './mobile.mjs'
import * as S from './story.mjs'

const browser = await launch()
const { page } = await openMobile(browser, { hash: `/t/${S.THREAD_MAIN}`, scale: 1 })
const labels = async () => console.log(await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)).filter(Boolean).join(' | ')))
await labels()
await page.tap('[aria-label="Open menu"]').catch((e) => console.log('tap menu fail', e.message.slice(0, 80)))
await page.waitForTimeout(1200)
await page.screenshot({ path: '../scratch/mp-drawer.png' })
await labels()
await browser.close()
