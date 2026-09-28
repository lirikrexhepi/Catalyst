import '@fontsource-variable/geist'
import './morph-lab.css'
import { morphActions, type MorphActionsHandle } from '../ui/glass/morphActions'
import { morphGroup } from '../ui/glass/morphGroup'

const TRASH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>'

const CHATS = ['Fix the login redirect', 'Morphing delete button', 'Tailscale key expiry']

const handles: MorphActionsHandle[] = []
const cost = document.querySelector<HTMLOutputElement>('[data-cost]')!
let worst = 0
let frames = 0

const onFrame = (ms: number) => {
  frames++
  worst = Math.max(worst, ms)
  cost.value = `${frames} frames · worst ${worst.toFixed(2)} ms`
}

const onOpenChange = () => {
  worst = 0
  frames = 0
}

handles.push(
  morphActions(document.querySelector<HTMLElement>('[data-center]')!, {
    icon: TRASH,
    label: 'Delete',
    tone: 'danger',
    actions: [
      { id: 'confirm', label: 'Confirm', tone: 'danger' },
      { id: 'cancel', label: 'Cancel', dismiss: true },
    ],
    onFrame,
    onOpenChange,
  }),
)

const list = document.querySelector<HTMLElement>('[data-list]')!

function addRow(title: string) {
  const row = document.createElement('div')
  row.className = 'mlab-row'
  const text = document.createElement('span')
  text.className = 'mlab-row-text'
  text.textContent = title
  const slot = document.createElement('div')
  row.append(text, slot)
  list.appendChild(row)
  const handle = morphActions(slot, {
    icon: TRASH,
    label: `Delete ${title}`,
    tone: 'danger',
    anchor: 'end',
    actions: [
      {
        id: 'confirm',
        label: 'Delete',
        tone: 'danger',
        onSelect: () => {
          row.classList.add('gone')
          window.setTimeout(() => row.classList.remove('gone'), 1600)
        },
      },
      { id: 'cancel', label: 'Cancel', dismiss: true },
    ],
    onFrame,
    onOpenChange,
  })
  handles.push(handle)
}

CHATS.forEach(addRow)

const SQUARE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>'
const RELOAD = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
const OPEN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>'

const group = morphGroup(document.querySelector<HTMLElement>('[data-group]')!, {
  anchor: 'end',
  triggers: [
    { id: 'stop', label: 'Stop dev server', icon: SQUARE, actions: [{ id: 'stop', label: 'Stop server', tone: 'danger' }, { id: 'cancel', label: 'Cancel', dismiss: true }] },
    { id: 'reload', label: 'Reload', icon: RELOAD, onClick: () => undefined },
    { id: 'open', label: 'Open in browser', icon: OPEN, actions: [{ id: 'browser', label: 'Browser' }, { id: 'copy', label: 'Copy link' }, { id: 'cancel', label: 'Cancel', dismiss: true }] },
  ],
  onFrame,
  onOpenChange: () => onOpenChange(),
})
handles.push({ open: () => group.open('stop'), close: group.close, setTimeScale: group.setTimeScale, isOpen: () => group.openId() !== null, destroy: group.destroy })
Object.assign(window, { labGroup: group })

const themeButton = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!
themeButton.addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light'
  document.documentElement.dataset.theme = light ? 'light' : 'dark'
  themeButton.textContent = light ? 'Dark' : 'Light'
})

const slowButton = document.querySelector<HTMLButtonElement>('[data-slow]')!
slowButton.setAttribute('aria-pressed', 'false')
slowButton.addEventListener('click', () => {
  const slow = slowButton.getAttribute('aria-pressed') !== 'true'
  slowButton.setAttribute('aria-pressed', String(slow))
  handles.forEach((h) => h.setTimeScale(slow ? 0.2 : 1))
})
