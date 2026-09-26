const KEYBOARD_THRESHOLD = 120

function insideScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null
  while (el && el !== document.body) {
    const style = getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return true
    if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1) return true
    el = el.parentElement
  }
  return false
}

function panLock() {
  let allow = true
  const onStart = (e: TouchEvent) => {
    allow = insideScroller(e.target)
  }
  const onMove = (e: TouchEvent) => {
    if (!allow && e.cancelable) e.preventDefault()
  }
  return {
    on() {
      document.addEventListener('touchstart', onStart, { passive: true })
      document.addEventListener('touchmove', onMove, { passive: false })
    },
    off() {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
    },
  }
}

export function trackVisualViewport(): () => void {
  const vv = window.visualViewport
  if (!vv) return () => undefined
  const root = document.documentElement
  const lock = panLock()
  let resting = vv.height
  let width = vv.width
  let open = false

  const apply = () => {
    if (vv.scale > 1.01) return
    if (Math.abs(vv.width - width) > 1) {
      width = vv.width
      resting = vv.height
    }
    resting = Math.max(resting, vv.height)
    root.style.setProperty('--app-h', `${vv.height}px`)
    root.style.setProperty('--app-y', `${vv.offsetTop}px`)
    const next = resting - vv.height > KEYBOARD_THRESHOLD
    if (next === open) return
    open = next
    root.classList.toggle('kb-open', open)
    if (open) lock.on()
    else {
      lock.off()
      window.scrollTo(0, 0)
    }
  }

  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  apply()
  return () => {
    vv.removeEventListener('resize', apply)
    vv.removeEventListener('scroll', apply)
    lock.off()
  }
}
