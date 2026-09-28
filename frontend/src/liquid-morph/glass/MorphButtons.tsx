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
  // Structural identity only. Labels and counts change constantly (task
  // progress, server counts) and must never destroy the group: a rebuild
  // snaps an open menu shut and drops focus mid-interaction.
  const [revision, setRevision] = useState(0)
  const labelSig = JSON.stringify(items.map((i) => [i.label, i.actions?.map((a) => a.label)]))
  const prevSig = useRef(labelSig)
  useEffect(() => {
    // Refresh stale labels while closed, where a rebuild is invisible. While
    // open the menu keeps its labels; they refresh the next time it opens.
    if (prevSig.current !== labelSig && !handle.current?.openId()) {
      setRevision((r) => r + 1)
    }
    prevSig.current = labelSig
  })
  const key = JSON.stringify({ revision, size, gap, spacing, inset, anchor, fontSize, items: items.map((i) => [i.id, i.tone, i.actions?.map((a) => [a.id, a.tone, a.dismiss])]) })

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
