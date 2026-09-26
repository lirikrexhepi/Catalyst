import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { GlassSquircle } from '../../ui'
import { SHEET } from './layout'

interface SheetListProps {
  children: ReactNode
  scroll?: boolean
  scrollKey?: string
}

export function SheetList({ children, scroll, scrollKey }: SheetListProps) {
  const scroller = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [scrollKey])

  return (
    <GlassSquircle radius={SHEET.listRadius} fill={SHEET.listFill} pressable={false} className="sheet-list">
      <div ref={scroller} className={scroll ? 'sheet-list-scroll' : undefined}>
        {children}
      </div>
    </GlassSquircle>
  )
}

export function SheetEmpty({ children }: { children: ReactNode }) {
  return <div className="sheet-empty">{children}</div>
}
