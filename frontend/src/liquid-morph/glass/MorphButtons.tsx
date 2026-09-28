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
  const key = JSON.stringify({ size, gap, spacing, inset, anchor, fontSize, items: items.map((i) => [i.id, i.label, i.tone, i.actions?.map((a) => [a.id, a.label, a.tone, a.dismiss])]) })

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
  useEffect(() => {
    handle.current?.update(latest.current.items.map((item) => ({ id: item.id, label: item.label, disabled: item.disabled })))
  }, [disabled, key])

  return (
    <div ref={host} className={className}>
      {slots.map((slot, k) => (slot && items[k] ? createPortal(items[k].icon, slot, items[k].id) : null))}
    </div>
  )
}
