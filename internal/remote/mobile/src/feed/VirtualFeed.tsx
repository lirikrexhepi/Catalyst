import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { LegendList, type LegendListRef } from '@legendapp/list/react'
import { BlockView } from './Feed'
import { duration } from '../format'
import type { AgentStreamBlock } from './types'

const NEAR_BOTTOM = 80

interface Memory {
  offset: number
  pinned: boolean
}

const memories = new Map<string, Memory>()

export interface VirtualFeedHandle {
  jump: () => void
}

interface VirtualFeedProps {
  threadId: string
  blocks: AgentStreamBlock[]
  turnMs: Record<string, number>
  header?: ReactNode
  footer?: ReactNode
  insetTop?: number
  insetBottom?: number
  onPinnedChange: (pinned: boolean) => void
}

interface ScrollLike {
  nativeEvent: {
    contentOffset: { y: number }
    contentSize: { height: number }
    layoutMeasurement: { height: number }
  }
}

export const VirtualFeed = forwardRef<VirtualFeedHandle, VirtualFeedProps>(function VirtualFeed(
  { threadId, blocks, turnMs, header, footer, insetTop = 0, insetBottom = 0, onPinnedChange },
  handle,
) {
  const list = useRef<LegendListRef | null>(null)
  const saved = useRef(memories.get(threadId))
  const pinnedRef = useRef(saved.current?.pinned ?? true)
  const [following, setFollowing] = useState(pinnedRef.current)

  useImperativeHandle(handle, () => ({
    jump: () => {
      pinnedRef.current = true
      setFollowing(true)
      onPinnedChange(true)
      void list.current?.scrollToEnd({ animated: false })
    },
  }))

  useEffect(() => {
    onPinnedChange(pinnedRef.current)
  }, [onPinnedChange])

  useEffect(() => {
    if (!pinnedRef.current) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void list.current?.scrollToEnd({ animated: false }))
    })
    const timer = window.setTimeout(() => {
      if (pinnedRef.current) void list.current?.scrollToEnd({ animated: false })
    }, 250)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [])

  const onScroll = useCallback(
    (event: ScrollLike) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
      const pinned = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_BOTTOM
      memories.set(threadId, { offset: contentOffset.y, pinned })
      if (pinned !== pinnedRef.current) {
        pinnedRef.current = pinned
        setFollowing(pinned)
        onPinnedChange(pinned)
      }
    },
    [threadId, onPinnedChange],
  )

  const renderItem = useCallback(
    ({ item }: { item: AgentStreamBlock }) => (
      <div className="feed-row">
        <BlockView threadId={threadId} block={item} />
        {turnMs[item.id] !== undefined && <div className="turn-end">took {duration(turnMs[item.id])}</div>}
      </div>
    ),
    [threadId, turnMs],
  )

  const restore = saved.current && !saved.current.pinned ? saved.current.offset : undefined

  return (
    <LegendList
      ref={list}
      className="chat-list"
      style={{ height: '100%' }}
      contentContainerStyle={{ paddingTop: insetTop + 12, paddingBottom: insetBottom + 4 }}
      data={blocks}
      keyExtractor={(block) => block.id}
      renderItem={renderItem}
      extraData={turnMs}
      estimatedItemSize={96}
      drawDistance={800}
      recycleItems={false}
      initialScrollAtEnd={restore === undefined}
      initialScrollOffset={restore}
      maintainScrollAtEnd={following}
      maintainScrollAtEndThreshold={0.2}
      {...(following ? {} : { maintainVisibleContentPosition: true })}
      onScroll={onScroll}
      ListHeaderComponent={header ? <>{header}</> : undefined}
      ListFooterComponent={footer ? <>{footer}</> : undefined}
    />
  )
})
