import { glass, shape } from './kit.js'

const LINKS = {
  download: '',
}

const root = document.documentElement
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

const ACCENT = 'linear-gradient(180deg, #0f5aa6 0%, #00417f 100%)'
const PILL = 9999

document.querySelectorAll('[data-download]').forEach((el) => {
  if (LINKS.download) {
    el.href = LINKS.download
    el.setAttribute('download', '')
  }
})

const island = document.getElementById('island')
glass(island, { radius: PILL, fill: 'rgba(22, 22, 22, 0.92)', frost: 24, pressable: false })

document.querySelectorAll('.btn').forEach((el) => {
  const accent = el.classList.contains('accent')
  glass(el, { radius: PILL, fill: accent ? ACCENT : 'var(--glass-control)' })
})

document.querySelectorAll('.frame').forEach((el) => {
  const radius = Number(el.dataset.shape) || 30
  el.style.borderRadius = '0'
  shape(el, radius)
  const rim = el.querySelector('.rim')
  if (rim) glass(rim, { radius, fill: 'transparent', pressable: false, light: { intensity: 0.5, backIntensity: 0.45 } })
})

const phoneRadius = () => (innerWidth < 900 ? 40 : 46)
document.querySelectorAll('.phone').forEach((el) => {
  const outer = phoneRadius()
  el.style.borderRadius = '0'
  shape(el, outer)
  glass(el, { radius: outer, fill: '#0a0a0a', pressable: false, light: { intensity: 0.6, backIntensity: 0.5 } })
  const screen = el.querySelector('.screen')
  if (screen) {
    screen.style.borderRadius = '0'
    shape(screen, outer - 8)
  }
})

requestAnimationFrame(() => root.classList.add('ready'))

const revealer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in')
      revealer.unobserve(entry.target)
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
)
document.querySelectorAll('[data-reveal]').forEach((el) => revealer.observe(el))

const lifts = [...document.querySelectorAll('[data-lift]')]
const phones = document.querySelector('.phones')
const cards = phones ? [...phones.querySelectorAll('.track .phone')] : []
const caption = phones?.querySelector('.caption')
const titleEl = phones?.querySelector('[data-title]')
const lineEl = phones?.querySelector('[data-line]')
const ticksEl = phones?.querySelector('.ticks')
const track = phones?.querySelector('.track')

const state = { t: 0, target: 0, shown: -1, swap: 0 }
let ticks = []
if (phones && ticksEl) {
  phones.style.setProperty('--n', String(cards.length))
  ticks = cards.map(() => ticksEl.appendChild(document.createElement('i')))
}

function setCaption(i) {
  if (!caption || state.shown === i) return
  const first = state.shown === -1
  state.shown = i
  ticks.forEach((tick, k) => tick.classList.toggle('on', k === i))
  const apply = () => {
    titleEl.textContent = cards[i].dataset.title
    lineEl.textContent = cards[i].dataset.line
    caption.classList.remove('swap')
  }
  if (first || reduce) {
    apply()
    return
  }
  caption.classList.add('swap')
  clearTimeout(state.swap)
  state.swap = setTimeout(apply, 170)
}

function layoutPhones(t) {
  const w = track.clientWidth
  const narrow = w < 900
  const first = cards[0]
  const pw = first.offsetWidth
  const step = pw * (narrow ? 1.12 : 1.16)
  const cx = w * (narrow ? 0.5 : 0.7)
  cards.forEach((card, i) => {
    const d = i - t
    const a = Math.abs(d)
    const scale = 1 - Math.min(a, 2) * 0.1
    const fade = narrow ? clamp(1 - Math.max(0, a - 0.35) * 1.6) : d < 0 ? clamp(1 - a * 1.7) : clamp(1 - Math.max(0, a - 0.4) * 0.5)
    const x = cx - pw / 2 + d * step
    card.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0) scale(${scale.toFixed(4)})`
    card.style.opacity = fade.toFixed(3)
    card.style.zIndex = String(100 - Math.round(a * 10))
    card.style.pointerEvents = 'none'
  })
}

function readPhones() {
  if (!phones) return
  const rect = phones.getBoundingClientRect()
  const total = phones.offsetHeight - innerHeight
  const p = clamp(-rect.top / total)
  state.target = p * (cards.length - 1)
}

function readLifts() {
  const vh = innerHeight
  for (const el of lifts) {
    const rect = el.getBoundingClientRect()
    const p = clamp((vh - rect.top) / (vh * 0.62))
    const eased = 1 - Math.pow(1 - p, 3)
    el.style.setProperty('--p', eased.toFixed(4))
  }
}

let ticking = false
function onScroll() {
  if (ticking) return
  ticking = true
  requestAnimationFrame(() => {
    ticking = false
    readLifts()
    readPhones()
    if (reduce) {
      state.t = state.target
    }
  })
}

function frame() {
  if (phones && cards.length) {
    const diff = state.target - state.t
    if (Math.abs(diff) > 0.0005) state.t += diff * (reduce ? 1 : 0.11)
    else state.t = state.target
    layoutPhones(state.t)
    setCaption(clamp(Math.round(state.t), 0, cards.length - 1))
  }
  requestAnimationFrame(frame)
}

addEventListener('scroll', onScroll, { passive: true })
addEventListener('resize', onScroll)
readLifts()
readPhones()
state.t = state.target
if (phones && cards.length) {
  layoutPhones(state.t)
  setCaption(clamp(Math.round(state.t), 0, cards.length - 1))
}
requestAnimationFrame(frame)

