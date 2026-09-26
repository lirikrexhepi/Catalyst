import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from 'react'

const NEAR_BOTTOM = 80

interface Memory {
  top: number
  pinned: boolean
}

const memories = new Map<string, Memory>()

export function useStickToBottom(deps: DependencyList, memoryKey?: string) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const saved = useRef(memoryKey ? memories.get(memoryKey) : undefined)
  const [pinned, setPinned] = useState(saved.current?.pinned ?? true)
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const restore = saved.current
    if (restore && !restore.pinned) {
      if (el.scrollHeight - el.clientHeight < restore.top) return
      el.scrollTop = restore.top
      saved.current = undefined
      return
    }
    if (pinned) el.scrollTop = el.scrollHeight
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
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    if (memoryKey) memories.set(memoryKey, { top: el.scrollTop, pinned: atBottom })
    setPinned(atBottom)
  }, [memoryKey])

  const jump = useCallback(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setPinned(true)
  }, [])

  return { scroller, pinned, onScroll, jump }
}
