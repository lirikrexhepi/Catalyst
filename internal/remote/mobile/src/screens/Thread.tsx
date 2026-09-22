import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ChevronLeft, MoreHorizontal, Power, RotateCcw, Square } from 'lucide-react'
import Feed from '../feed/Feed'
import Composer from '../components/Composer'
import Sheet from '../components/Sheet'
import Elapsed from '../components/Elapsed'
import { api } from '../api'
import { duration } from '../format'
import { interrupt, loadThread, message, refreshSummaries, useStore } from '../store'

export default function Thread({ threadId, back }: { threadId: string; back: () => void }) {
  const summary = useStore((s) => s.summaries.find((t) => t.threadId === threadId))
  const thread = useStore((s) => s.threads[threadId])
  const [menu, setMenu] = useState(false)
  const [pinned, setPinned] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const isCoordinator = threadId === 'coordinator'

  useEffect(() => {
    void loadThread(threadId)
  }, [threadId])

  // Stay at the bottom while new output arrives, unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned) el.scrollTop = el.scrollHeight
  }, [thread?.blocks, pinned])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const busy = Boolean(thread?.busy)
  const title = isCoordinator ? 'Orchestrator' : summary?.title || 'Agent'
  const where = [summary?.projectName, summary?.branch].filter(Boolean).join(' on ')

  const act = async (fn: () => Promise<unknown>) => {
    setMenu(false)
    setActionError(null)
    try {
      await fn()
      void refreshSummaries()
    } catch (e) {
      setActionError(message(e))
    }
  }

  return (
    <div className="screen">
      <header className="bar">
        <button className="icon-btn" onClick={back} aria-label="Back to agents">
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <div className="thread-title">
          <div className="t">{title}</div>
          <div className="s" role="status">
            {busy ? (
              <>
                Working <Elapsed since={thread?.turnStartedAt} />
              </>
            ) : summary?.lastTurnMs ? (
              <>Idle, last turn took {duration(summary.lastTurnMs)}</>
            ) : (
              <>{where || 'Idle'}</>
            )}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Thread actions">
          <MoreHorizontal size={22} aria-hidden="true" />
        </button>
        {busy && <div className="lamp-line" aria-hidden="true" />}
      </header>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="scroll" ref={scroller} onScroll={onScroll}>
          {thread?.error && !thread.loaded && (
            <div className="empty">
              <strong>Could not load this conversation</strong>
              {thread.error}
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => void loadThread(threadId, true)}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {!thread?.loaded && !thread?.error && <div className="empty">Loading conversation</div>}
          {thread?.loaded && thread.blocks.length === 0 && (
            <div className="empty">
              <strong>{isCoordinator ? 'Plan work across agents' : 'Nothing here yet'}</strong>
              {isCoordinator
                ? 'Describe what you need. The orchestrator splits it into tasks and starts agents for them.'
                : 'Send a message to give this agent its next task.'}
            </div>
          )}
          {thread?.loaded && <Feed threadId={threadId} blocks={thread.blocks} turnMs={thread.turnMs} />}
          {actionError && (
            <div className="feed">
              <div className="say error">{actionError}</div>
            </div>
          )}
        </div>
        {!pinned && (
          <button
            className="jump"
            onClick={() => {
              const el = scroller.current
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
              setPinned(true)
            }}
          >
            <ArrowDown size={14} aria-hidden="true" /> Latest
          </button>
        )}
      </div>

      <Composer threadId={threadId} placeholder={isCoordinator ? 'Describe the work' : 'Message this agent'} />

      {menu && (
        <Sheet title={title} onClose={() => setMenu(false)}>
          <div className="list">
            <button disabled={!busy} onClick={() => void act(() => interrupt(threadId))}>
              <Square size={18} aria-hidden="true" /> Stop the current turn
            </button>
            {isCoordinator ? (
              <button onClick={() => void act(() => api.newConversation().then(() => loadThread(threadId, true)))}>
                <RotateCcw size={18} aria-hidden="true" /> Start a new conversation
              </button>
            ) : (
              <button
                style={{ color: 'var(--fault)' }}
                onClick={() =>
                  void act(async () => {
                    await api.endAgent(threadId)
                    back()
                  })
                }
              >
                <Power size={18} aria-hidden="true" /> End this agent
              </button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}
