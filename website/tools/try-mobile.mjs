import { launch, openMobile } from './mobile.mjs'
import * as S from './story.mjs'

const browser = await launch()
const jobs = [
  ['thread', `/t/${S.THREAD_MAIN}`],
  ['drawer', `/t/${S.THREAD_MAIN}`, 'drawer'],
  ['ask', `/t/${S.THREAD_ASK}`],
  ['question', `/t/${S.THREAD_QUESTION}`],
  ['project', `/p/${encodeURIComponent('C:/code/atlas')}`],
]
for (const [name, hash, action] of jobs) {
  const { ctx, page } = await openMobile(browser, { hash, scale: 2 })
  if (action === 'drawer') {
    await page.evaluate(() => document.querySelector('[aria-label="Open menu"]')?.click())
    await page.waitForTimeout(900)
  }
  await page.screenshot({ path: `../scratch/mm-${name}.png` })
  await ctx.close()
}
await browser.close()
