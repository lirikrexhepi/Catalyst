import { bridgePath, capsuleOutline } from '../geometry/bridge'
import { squirclePath } from '../geometry/squircle'
import { prefersReducedMotion } from '../motion/gesture'
import { springAt, type SpringConfig } from '../motion/spring'

export interface MorphAction {
  id: string
  label: string
  /** Inline SVG/HTML rendered before the label inside the pill. */
  icon?: string
  /** Active choice: the piece keeps the hover fill so current reads via bg, not a tick. */
  selected?: boolean
  tone?: 'danger'
  dismiss?: boolean
  onSelect?: () => void
}

export interface MorphTrigger {
  id: string
  label: string
  icon?: string
  tone?: 'danger'
  disabled?: boolean
  actions?: MorphAction[]
  onClick?: () => void
}

export interface MorphGroupOptions {
  triggers: MorphTrigger[]
  size?: number
  gap?: number
  spacing?: number
  inset?: number
  anchor?: 'start' | 'center' | 'end'
  fontSize?: number
  onOpenChange?: (id: string | null) => void
  onFrame?: (ms: number) => void
}

export interface MorphGroupHandle {
  open(id: string): void
  close(focusTrigger?: boolean): void
  update(triggers: MorphTrigger[]): void
  iconSlot(id: string): HTMLElement | null
  setTimeScale(scale: number): void
  openId(): string | null
  destroy(): void
}

const OPEN: SpringConfig = { damping: 0.8, response: 0.42 }
const CLOSE: SpringConfig = { damping: 0.92, response: 0.34 }
const CALM: SpringConfig = { damping: 1, response: 0.22 }
const STAGGER = 35
const CLOSE_DELAY = 50
const BUD = 0.36
const BLUR = 6
const NS = 'http://www.w3.org/2000/svg'
const SHADOW: readonly [number, number, number][] = [
  [2, 4, 0.9],
  [4, 10, 0.5],
  [7, 18, 0.28],
  [10, 28, 0.14],
]

let uid = 0

interface Rect {
  x: number
  w: number
  h: number
}

class Channel {
  private from: number
  private to: number
  private velocity = 0
  private start = 0
  private config: SpringConfig = OPEN
  private pending: { to: number; config: SpringConfig; at: number } | null = null
  value: number
  speed = 0

  constructor(value: number) {
    this.from = value
    this.to = value
    this.value = value
  }

  retarget(to: number, config: SpringConfig, at: number) {
    this.pending = { to, config, at }
  }

  jump(value: number) {
    this.from = this.to = this.value = value
    this.velocity = this.speed = 0
    this.pending = null
  }

  sample(now: number): boolean {
    if (this.pending && now >= this.pending.at) {
      this.from = this.value
      this.velocity = this.speed
      this.to = this.pending.to
      this.config = this.pending.config
      this.start = now
      this.pending = null
    }
    const s = springAt(this.from, this.to, this.velocity, this.config, (now - this.start) / 1000)
    this.value = s.value
    this.speed = s.velocity
    const settled = !this.pending && Math.abs(s.value - this.to) < 0.05 && Math.abs(s.velocity) < 2
    if (settled) {
      this.value = this.to
      this.speed = 0
    }
    return !settled
  }
}

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

const round = (n: number, places = 100) => Math.round(n * places) / places

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

function blur(el: HTMLElement, px: number) {
  el.style.filter = px > 0.05 ? `blur(${round(px, 10)}px)` : 'none'
}

export function morphGroup(host: HTMLElement, options: MorphGroupOptions): MorphGroupHandle {
  const size = options.size ?? 44
  const gap = options.gap ?? 10
  const spacing = options.spacing ?? 12
  const inset = options.inset ?? Math.round(size * 0.55)
  const fontSize = options.fontSize ?? Math.max(12, Math.min(16, Math.round(size * 0.36)))
  const anchor = options.anchor ?? 'center'
  const id = `mg${++uid}`
  let triggers = options.triggers
  const count = triggers.length
  const pieceCount = Math.max(count, ...triggers.map((t) => t.actions?.length ?? 0))
  let scale = 1
  let active = -1
  let frame = 0
  let clock = 0
  let last = 0
  let calm = prefersReducedMotion()

  host.classList.add('ma')
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  host.style.height = `${size}px`
  host.style.flexShrink = '0'

  const shape = svg('svg', { 'aria-hidden': 'true', focusable: 'false' })
  shape.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none'
  const defs = svg('defs')
  const rimGradient = (name: string, x1: string, y1: string, x2: string, y2: string) => {
    const gradient = svg('linearGradient', { id: `${id}-${name}`, x1, y1, x2, y2 })
    for (const [offset, strength] of [['0', 'var(--ma-rim-hi, 0.7)'], ['0.42', 'var(--ma-rim-lo, 0.08)'], ['0.58', 'var(--ma-rim-lo, 0.08)'], ['1', 'var(--ma-rim-hi, 0.7)']]) {
      const stop = svg('stop', { offset })
      stop.style.stopColor = 'var(--ma-rim, var(--rim, #fff))'
      stop.style.stopOpacity = strength
      gradient.appendChild(stop)
    }
    defs.appendChild(gradient)
  }
  rimGradient('rim', '0', '0', '1', '1')
  rimGradient('neck', '0', '1', '1', '0')

  const piecePaths = Array.from({ length: pieceCount }, (_, i) => defs.appendChild(svg('path', { id: `${id}-p${i}` })))
  const neckPaths = Array.from({ length: pieceCount - 1 }, (_, i) => defs.appendChild(svg('path', { id: `${id}-b${i}` })))
  const edgePaths = Array.from({ length: pieceCount - 1 }, (_, i) => defs.appendChild(svg('path', { id: `${id}-e${i}` })))
  shape.appendChild(defs)

  const use = (ref: SVGPathElement) => svg('use', { href: `#${ref.id}` })
  const fillOrder = [...piecePaths.map((p, i) => ({ p, i }))].reverse()

  for (const [y, width, strength] of SHADOW) {
    const g = svg('g', { transform: `translate(0 ${y})`, fill: '#000', stroke: '#000', 'stroke-width': String(width), 'stroke-linejoin': 'round' })
    g.style.opacity = `calc(var(--ma-shadow, 0) * ${strength})`
    ;[...piecePaths, ...neckPaths].forEach((p) => g.appendChild(use(p)))
    shape.appendChild(g)
  }
  const rims = svg('g', { fill: 'none', 'stroke-width': '2' })
  piecePaths.forEach((p) => {
    const u = use(p)
    u.setAttribute('stroke', `url(#${id}-rim)`)
    rims.appendChild(u)
  })
  edgePaths.forEach((p) => {
    const u = use(p)
    u.setAttribute('stroke', `url(#${id}-neck)`)
    u.setAttribute('stroke-linecap', 'round')
    rims.appendChild(u)
  })
  shape.appendChild(rims)

  const baseFill = 'var(--ma-fill, var(--glass-control, #414141))'
  const fills = svg('g')
  neckPaths.forEach((p) => {
    const u = use(p)
    u.style.fill = baseFill
    fills.appendChild(u)
  })
  const pieceFills: SVGUseElement[] = []
  fillOrder.forEach(({ p, i }) => {
    const u = use(p)
    u.style.fill = baseFill
    u.style.transition = 'fill 160ms cubic-bezier(0.32, 0.72, 0, 1)'
    fills.appendChild(u)
    pieceFills[i] = u
  })
  shape.appendChild(fills)
  host.appendChild(shape)

  const textColor = (tone?: 'danger') => (tone === 'danger' ? 'var(--ma-danger, #ff453a)' : 'var(--ma-fg, var(--fg, #fff))')

  const menus = triggers.map((trigger, k) => {
    const group = document.createElement('div')
    group.id = `${id}-g${k}`
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', trigger.label)
    group.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    group.inert = true
    const buttons = (trigger.actions ?? []).map((action) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ma-action'
      button.dataset.action = action.id
      button.style.cssText = `position:absolute;top:0;height:${size}px;border-radius:${size / 2}px;background:none;border:0;padding:0;display:grid;place-items:center;touch-action:manipulation;white-space:nowrap;font:500 ${fontSize}px/1 var(--font, system-ui);color:${textColor(action.tone)};pointer-events:auto;outline:none;cursor:pointer`
      const row = document.createElement('span')
      row.className = 'ma-label'
      row.style.cssText = 'display:flex;align-items:center;gap:6px;opacity:0;will-change:transform,opacity'
      let icon: HTMLElement | null = null
      if (action.icon) {
        icon = document.createElement('span')
        icon.className = 'ma-icon'
        icon.setAttribute('aria-hidden', 'true')
        icon.style.cssText = 'display:grid;place-items:center;flex-shrink:0'
        icon.innerHTML = action.icon
        row.appendChild(icon)
      }
      const text = document.createElement('span')
      text.className = 'ma-text'
      text.textContent = action.label
      text.style.cssText = 'display:block'
      row.appendChild(text)
      button.appendChild(row)
      group.appendChild(button)
      return { button, row, icon, text }
    })
    host.appendChild(group)
    return { group, buttons }
  })

  const circles = triggers.map((trigger, k) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ma-trigger'
    button.setAttribute('aria-label', trigger.label)
    if (trigger.actions?.length) {
      button.setAttribute('aria-expanded', 'false')
      button.setAttribute('aria-controls', `${id}-g${k}`)
    }
    button.style.cssText = `position:absolute;top:0;width:${size}px;height:${size}px;border-radius:${size / 2}px;display:grid;place-items:center;background:none;border:0;padding:0;color:${textColor(trigger.tone)};touch-action:manipulation;outline:none;cursor:pointer`
    const icon = document.createElement('span')
    icon.setAttribute('aria-hidden', 'true')
    icon.style.cssText = 'display:grid;place-items:center;will-change:transform,opacity'
    if (trigger.icon) icon.innerHTML = trigger.icon
    button.appendChild(icon)
    host.appendChild(button)
    return { button, icon }
  })

  let closedRects: Rect[] = []
  let openRects: Rect[][] = []

  const layout = () => {
    const closedWidth = count * size + (count - 1) * spacing
    host.style.width = `${closedWidth}px`
    const bud = size * BUD
    const circleRects = triggers.map((_, k) => ({ x: k * (size + spacing), w: size, h: size }))
    const lastCircle = circleRects[count - 1]
    const budRect = { x: lastCircle.x + (size - bud) / 2, w: bud, h: bud }
    closedRects = Array.from({ length: pieceCount }, (_, i) => (i < count ? circleRects[i] : budRect))
    openRects = menus.map(({ buttons }) => {
      if (buttons.length === 0) return closedRects
      const widths = buttons.map(({ row }) => Math.max(size * 1.6, row.offsetWidth + inset * 2))
      const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)
      let left = anchor === 'start' ? 0 : anchor === 'end' ? closedWidth - total : (closedWidth - total) / 2
      const rects = widths.map((w) => {
        const r = { x: left, w, h: size }
        left += w + gap
        return r
      })
      const tail = rects[rects.length - 1]
      const merge = { x: tail.x + tail.w - size / 2 - bud / 2, w: bud, h: bud }
      return Array.from({ length: pieceCount }, (_, i) => rects[i] ?? merge)
    })
    circles.forEach(({ button }, k) => {
      button.style.left = `${circleRects[k].x}px`
    })
    menus.forEach(({ buttons }, k) => {
      buttons.forEach(({ button }, i) => {
        button.style.left = `${openRects[k][i].x}px`
        button.style.width = `${openRects[k][i].w}px`
      })
    })
  }
  layout()

  const pieces = closedRects.map((r) => ({ x: new Channel(r.x), w: new Channel(r.w), h: new Channel(r.h) }))
  let shown = -1
  const written = new Map<string, string>()

  const write = (el: Element, key: string, attr: string, value: string) => {
    if (written.get(key) === value) return
    written.set(key, value)
    el.setAttribute(attr, value)
  }

  const paint = () => {
    const rects = pieces.map((p) => ({ x: p.x.value, w: Math.max(p.w.value, p.h.value), h: Math.max(1, p.h.value) }))
    rects.forEach((r, i) => {
      write(piecePaths[i], `p${i}`, 'd', squirclePath({ width: r.w, height: r.h, radius: r.h / 2 }))
      write(piecePaths[i], `t${i}`, 'transform', `translate(${round(r.x)} ${round((size - r.h) / 2)})`)
    })
    for (let i = 0; i < pieceCount - 1; i++) {
      const a = rects[i]
      const b = rects[i + 1]
      const c1 = a.x + a.w - a.h / 2
      const c2 = b.x + b.h / 2
      const neck =
        c2 - c1 < a.h / 2 + b.h / 2 + gap
          ? bridgePath(c1, a.h / 2, c2, b.h / 2, size / 2, gap * 0.85, capsuleOutline(a.x, (size - a.h) / 2, a.w, a.h, 'right'), capsuleOutline(b.x, (size - b.h) / 2, b.w, b.h, 'left'))
          : { fill: '', edge: '' }
      write(neckPaths[i], `b${i}`, 'd', neck.fill)
      write(edgePaths[i], `e${i}`, 'd', neck.edge)
    }
    const menu = shown >= 0 ? openRects[shown] : null
    rects.forEach((r, i) => {
      const from = closedRects[i]
      const to = menu ? menu[i] : from
      const span = to.w - from.w
      const p = Math.abs(span) > 0.5 ? Math.min(1, Math.max(0, (r.w - from.w) / span)) : 0
      if (i < count) {
        const gone = smooth(0.05, 0.5, p)
        const { icon } = circles[i]
        icon.style.transform = `translateX(${round(r.x - from.x, 10)}px)`
        icon.style.opacity = String(round(1 - gone, 1000))
        blur(icon, calm ? 0 : BLUR * smooth(0, 0.6, p))
      }
    })
    menus.forEach(({ buttons }, k) => {
      buttons.forEach(({ row }, i) => {
        if (k !== shown) {
          row.style.opacity = '0'
          return
        }
        const r = rects[i]
        const from = closedRects[i]
        const to = openRects[k][i]
        const p = Math.min(1, Math.max(0, (r.w - from.w) / (to.w - from.w)))
        const visible = i === 0 ? smooth(0.35, 0.95, p) : smooth(0.2, 0.85, p)
        const grow = i < count ? 1 : 0.8 + 0.2 * p
        row.style.transform = `translateX(${round(r.x + r.w / 2 - (to.x + to.w / 2), 10)}px) scale(${round(grow, 1000)})`
        row.style.opacity = String(round(visible, 1000))
        blur(row, calm ? 0 : BLUR * (1 - visible))
      })
    })
  }

  const tick = (now: number) => {
    const started = performance.now()
    clock += Math.min(64, Math.max(0, now - last)) * scale
    last = now
    let moving = false
    for (const p of pieces) {
      if (p.x.sample(clock)) moving = true
      if (p.w.sample(clock)) moving = true
      if (p.h.sample(clock)) moving = true
    }
    paint()
    options.onFrame?.(performance.now() - started)
    if (moving) {
      frame = requestAnimationFrame(tick)
      return
    }
    frame = 0
    if (active < 0) {
      shown = -1
      host.style.zIndex = ''
    }
  }

  const run = () => {
    if (frame) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }

  const hovered = new Set<string>()
  const focused = new Set<string>()

  const tint = () => {
    for (let i = 0; i < pieceCount; i++) {
      let danger = false
      let lit = false
      if (active >= 0) {
        const action = triggers[active].actions?.[i]
        danger = action?.tone === 'danger'
        lit = Boolean(action) && (hovered.has(`a${i}`) || focused.has(`a${i}`) || action?.selected === true)
      } else if (i < count) {
        danger = triggers[i].tone === 'danger'
        lit = hovered.has(`t${i}`) || focused.has(`t${i}`)
      }
      pieceFills[i].style.fill = lit ? (danger ? 'var(--ma-danger-hover, #5c2f2c)' : 'var(--ma-hover, #4c4c4c)') : baseFill
    }
  }

  const watch = (el: HTMLButtonElement, key: string) => {
    const mark = (set: Set<string>, on: boolean) => {
      if (on) set.add(key)
      else set.delete(key)
      tint()
    }
    el.addEventListener('pointerenter', () => mark(hovered, true))
    el.addEventListener('pointerleave', () => mark(hovered, false))
    el.addEventListener('focus', () => mark(focused, el.matches(':focus-visible')))
    el.addEventListener('blur', () => mark(focused, false))
  }

  const retarget = (targets: Rect[], config: SpringConfig, delayOf: (i: number) => number) => {
    pieces.forEach((p, i) => {
      const at = clock + delayOf(i)
      p.x.retarget(targets[i].x, config, at)
      p.w.retarget(targets[i].w, config, at)
      p.h.retarget(targets[i].h, config, at)
    })
    run()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(true)
  }
  const onOutside = (e: PointerEvent) => {
    if (!host.contains(e.target as Node)) close(false)
  }

  function open(triggerId: string) {
    const k = triggers.findIndex((t) => t.id === triggerId)
    if (k < 0 || active >= 0 || !triggers[k].actions?.length || triggers[k].disabled) return
    active = k
    shown = k
    hovered.clear()
    focused.clear()
    tint()
    host.style.zIndex = '2'
    circles.forEach(({ button }, i) => {
      button.inert = true
      if (i === k) button.setAttribute('aria-expanded', 'true')
    })
    menus[k].group.inert = false
    calm = prefersReducedMotion()
    retarget(openRects[k], calm ? CALM : OPEN, (i) => (calm ? 0 : Math.abs(i - k) * STAGGER))
    const safe = (triggers[k].actions ?? []).findIndex((a) => a.dismiss)
    menus[k].buttons[safe >= 0 ? safe : 0].button.focus({ preventScroll: true })
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside, true)
    options.onOpenChange?.(triggers[k].id)
  }

  function close(focusTrigger = true) {
    if (active < 0) return
    const k = active
    active = -1
    hovered.clear()
    focused.clear()
    tint()
    const hadFocus = host.contains(document.activeElement)
    menus[k].group.inert = true
    circles.forEach(({ button }, i) => {
      button.inert = false
      if (i === k) button.setAttribute('aria-expanded', 'false')
    })
    circles.forEach(({ button }, i) => {
      button.disabled = Boolean(triggers[i].disabled)
    })
    calm = prefersReducedMotion()
    retarget(closedRects, calm ? CALM : CLOSE, (i) => (calm || i >= count ? 0 : CLOSE_DELAY))
    if (focusTrigger && hadFocus) circles[k].button.focus({ preventScroll: true })
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('pointerdown', onOutside, true)
    options.onOpenChange?.(null)
  }

  circles.forEach(({ button }, k) => {
    watch(button, `t${k}`)
    button.disabled = Boolean(triggers[k].disabled)
    button.addEventListener('click', () => {
      const trigger = triggers[k]
      if (trigger.actions?.length) open(trigger.id)
      else trigger.onClick?.()
    })
  })
  menus.forEach(({ buttons }, k) => {
    buttons.forEach(({ button }, i) => {
      watch(button, `a${i}`)
      button.addEventListener('click', () => {
        const action = triggers[k].actions?.[i]
        if (!action) return
        action.onSelect?.()
        close(Boolean(action.dismiss))
      })
    })
  })

  paint()
  let alive = true
  document.fonts?.ready.then(() => {
    if (!alive) return
    layout()
    const target = active >= 0 ? openRects[active] : closedRects
    pieces.forEach((p, i) => {
      p.x.jump(target[i].x)
      p.w.jump(target[i].w)
      p.h.jump(target[i].h)
    })
    paint()
  })

  return {
    open,
    close,
    update(next) {
      triggers = triggers.map((t, i) => ({ ...t, ...next[i], actions: t.actions?.map((a, j) => ({ ...a, ...next[i]?.actions?.[j] })) }))
      if (active < 0) circles.forEach(({ button }, i) => (button.disabled = Boolean(triggers[i].disabled)))
      // Live-refresh pill content so label/count/selected churn never needs a
      // rebuild (which would destroy the trigger mid-click). Geometry only
      // re-measures while closed, where it is invisible.
      menus.forEach(({ buttons }, k) => {
        const actions = triggers[k]?.actions ?? []
        buttons.forEach(({ row, icon, text }, i) => {
          const action = actions[i]
          if (!action) return
          if (text.textContent !== action.label) text.textContent = action.label
          if (icon && action.icon !== undefined && icon.innerHTML !== action.icon) icon.innerHTML = action.icon ?? ''
        })
      })
      if (active < 0) {
        layout()
        pieces.forEach((p, i) => {
          p.x.jump(closedRects[i].x)
          p.w.jump(closedRects[i].w)
          p.h.jump(closedRects[i].h)
        })
        tint()
        paint()
      } else {
        tint()
      }
    },
    iconSlot(triggerId) {
      const k = triggers.findIndex((t) => t.id === triggerId)
      return k >= 0 ? circles[k].icon : null
    },
    setTimeScale(next) {
      scale = Math.max(0, next)
      run()
    },
    openId: () => (active >= 0 ? triggers[active].id : null),
    destroy() {
      alive = false
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside, true)
      host.replaceChildren()
      host.classList.remove('ma')
    },
  }
}
