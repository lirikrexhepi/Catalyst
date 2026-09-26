import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from 'react'

const NEAR_BOTTOM = 80

export function useStickToBottom(deps: DependencyList) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(true)
  const pinnedRef = useRef(true)
  pinnedRef.current = pinned

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned) el.scrollTop = el.scrollHeight
  }, [pinned, ...deps])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let last = el.clientHeight
    const ro = new ResizeObserver(() => {
      if (el.clientHeight !== last && pinnedRef.current) el.scrollTop = el.scrollHeight
      last = el.clientHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM)
  }, [])

  const jump = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setPinned(true)
  }, [])

  return { scroller, pinned, onScroll, jump }
}
