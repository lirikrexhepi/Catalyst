const KEYBOARD_THRESHOLD = 120
const GLIDE_MS = 320
const GLIDE_EASE = 'cubic-bezier(0.22, 0.9, 0.3, 1)'
const HEAL_DELAY = 140

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

function currentShift(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform
  if (!transform || transform === 'none') return 0
  return new DOMMatrixReadOnly(transform).m42
}

function glide(selector: string, from: number) {
  if (Math.abs(from) < 1) return
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    const start = from + currentShift(el)
    el.getAnimations().forEach((a) => {
      if (a.id === 'kb-glide') a.cancel()
    })
    const anim = el.animate([{ transform: `translateY(${start}px)` }, { transform: 'translateY(0px)' }], {
      duration: GLIDE_MS,
      easing: GLIDE_EASE,
    })
    anim.id = 'kb-glide'
  })
}

function healViewport() {
  const root = document.getElementById('root')
  if (!root) return
  const scrollers = Array.from(document.querySelectorAll<HTMLElement>('.chat-scroll'))
  const positions = scrollers.map((s) => s.scrollTop)
  root.style.display = 'none'
  void root.offsetHeight
  root.style.display = ''
  scrollers.forEach((s, i) => {
    s.scrollTop = positions[i]
  })
}

export function trackVisualViewport(): () => void {
  const vv = window.visualViewport
  if (!vv) return () => undefined
  const root = document.documentElement
  const lock = panLock()
  let resting = vv.height
  let width = vv.width
  let open = false
  let top = vv.offsetTop
  let height = vv.height
  let healTimer = 0

  const write = () => {
    root.style.setProperty('--app-h', `${height}px`)
    root.style.setProperty('--app-y', `${top}px`)
  }

  const apply = () => {
    if (vv.scale > 1.01) return
    const rotated = Math.abs(vv.width - width) > 1
    if (rotated) {
      width = vv.width
      resting = vv.height
    }
    resting = Math.max(resting, vv.height)
    const nextTop = vv.offsetTop
    const nextHeight = vv.height
    const bottomShift = top + height - nextTop - nextHeight
    const topShift = top - nextTop
    top = nextTop
    height = nextHeight
    write()
    if (!rotated) {
      glide('[data-kb-follow="bottom"]', bottomShift)
      glide('[data-kb-follow="top"]', topShift)
    }
    const next = resting - vv.height > KEYBOARD_THRESHOLD
    if (next === open) return
    open = next
    root.classList.toggle('kb-open', open)
    if (open) {
      window.clearTimeout(healTimer)
      lock.on()
    } else {
      lock.off()
      window.scrollTo(0, 0)
      healTimer = window.setTimeout(() => {
        if (resting - vv.height > 4) healViewport()
      }, HEAL_DELAY)
    }
  }

  vv.addEventListener('resize', apply)
  vv.addEventListener('scroll', apply)
  write()
  return () => {
    vv.removeEventListener('resize', apply)
    vv.removeEventListener('scroll', apply)
    lock.off()
    window.clearTimeout(healTimer)
  }
}
