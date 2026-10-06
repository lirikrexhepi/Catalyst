import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { morphGroup, type MorphAction, type MorphGroupHandle } from './morphGroup'

export interface MorphButtonItem {
  id: string
  label: string
  icon: ReactNode
  tone?: 'danger'
  disabled?: boolean
  actions?: MorphAction[]
  onClick?: () => void
}

export interface MorphButtonsProps {
  items: MorphButtonItem[]
  size?: number
  gap?: number
  spacing?: number
  inset?: number
  anchor?: 'start' | 'center' | 'end'
  fontSize?: number
  className?: string
  onOpenChange?: (id: string | null) => void
}

const strip = (items: MorphButtonItem[]) =>
  items.map(({ icon: _icon, ...item }) => ({
    ...item,
    onClick: item.onClick,
    actions: item.actions,
  }))

export function MorphButtons({ items, size, gap, spacing, inset, anchor, fontSize, className, onOpenChange }: MorphButtonsProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const handle = useRef<MorphGroupHandle | null>(null)
  const latest = useRef({ items, onOpenChange })
  latest.current = { items, onOpenChange }
  const [slots, setSlots] = useState<(HTMLElement | null)[]>([])
  // Structural identity only: labels, counts and selection flow through
  // update() so live churn never destroys the group (which would drop an
  // in-flight click/focus). A rebuild happens only when buttons appear,
  // disappear or change tone.
  const key = JSON.stringify({ size, gap, spacing, inset, anchor, fontSize, items: items.map((i) => [i.id, i.tone, i.actions?.map((a) => [a.id, a.tone])]) })

  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    const current = latest.current.items
    const group = morphGroup(el, {
      size,
      gap,
      spacing,
      inset,
      anchor,
      fontSize,
      triggers: strip(current).map((item, k) => ({
        ...item,
        onClick: () => latest.current.items[k]?.onClick?.(),
        actions: item.actions?.map((action, i) => ({ ...action, onSelect: () => latest.current.items[k]?.actions?.[i]?.onSelect?.() })),
      })),
      onOpenChange: (id) => latest.current.onOpenChange?.(id),
    })
    handle.current = group
    setSlots(current.map((item) => group.iconSlot(item.id)))
    return () => {
      handle.current = null
      setSlots([])
      group.destroy()
    }
  }, [key])

  const disabled = items.map((i) => Boolean(i.disabled)).join()
  const contentSig = JSON.stringify(
    items.map((i) => [i.label, i.disabled, i.actions?.map((a) => [a.label, a.icon, a.selected, a.dismiss])]),
  )
  useEffect(() => {
    handle.current?.update(
      latest.current.items.map((item) => ({
        id: item.id,
        label: item.label,
        disabled: item.disabled,
        actions: item.actions?.map((a) => ({
          id: a.id,
          label: a.label,
          icon: a.icon,
          selected: a.selected,
          tone: a.tone,
          dismiss: a.dismiss,
        })),
      })),
    )
    // contentSig re-pushes live labels/selection; key rebuilds structure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, contentSig, key])

  // Capture-phase fallback: if a trigger click ever reaches the host without
  // the engine opening (e.g. listener lost in a rebuild race), open it here.
  // Runs before the trigger's own bubble listener; a duplicate open() is a
  // harmless no-op thanks to the engine's active guard.
  const openTriggerFromEvent = (e: React.MouseEvent) => {
    const h = handle.current
    if (!h || h.openId()) return
    const hostEl = host.current
    const target = e.target as HTMLElement | null
    const hit = target?.closest?.('.ma-trigger')
    if (!hit || !hostEl?.contains(hit)) return
    const order = Array.from(hostEl.querySelectorAll(':scope > .ma-trigger'))
    const k = order.indexOf(hit)
    const id = k >= 0 ? latest.current.items[k]?.id : undefined
    if (id) h.open(id)
  }

  return (
    <div ref={host} className={className} onClickCapture={openTriggerFromEvent}>
      {slots.map((slot, k) => (slot && items[k] ? createPortal(items[k].icon, slot, items[k].id) : null))}
    </div>
  )
}
