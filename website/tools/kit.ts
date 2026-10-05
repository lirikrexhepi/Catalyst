import { glass } from './vendor/ui/vanilla/glass'
import { isCircle, squirclePath } from './vendor/ui/geometry/squircle'
import { SPRINGS, springAt } from './vendor/ui/motion/spring'

function shape(el: HTMLElement, radius: number, smoothing = 1): () => void {
  const paint = (width: number, height: number) => {
    if (width <= 0 || height <= 0) return
    const s = { width, height, radius, smoothing }
    const clip = isCircle(s) ? '' : `path('${squirclePath(s)}')`
    el.style.clipPath = clip
    el.style.setProperty('-webkit-clip-path', clip)
  }
  paint(el.offsetWidth, el.offsetHeight)
  const ro = new ResizeObserver((entries) => {
    const box = entries[0]?.borderBoxSize?.[0]
    if (box) paint(box.inlineSize, box.blockSize)
    else paint(el.offsetWidth, el.offsetHeight)
  })
  ro.observe(el, { box: 'border-box' })
  return () => ro.disconnect()
}

export { glass, shape, SPRINGS, springAt }
