import { useEffect, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import Feed from '../../feed/Feed'
import { ModelPicker } from '../../components/modelPicker/ModelPicker'
import Elapsed from '../../components/Elapsed'
import { ChatFrame } from '../../components/chrome/ChatFrame'
import { TopBar } from '../../components/chrome/TopBar'
import { ModelSwitch } from '../../components/chrome/ModelSwitch'
import { usageRatio } from '../../components/chrome/usageTone'
import { Composer } from '../../components/composer/Composer'
import { providerIcon } from '../../components/providerIcons'
import { useStickToBottom } from '../../hooks/useStickToBottom'
import { StatusCard } from '../../components/status/StatusCard'
import { HistoryScrubber } from '../../components/scrubber/HistoryScrubber'
import { api } from '../../api'
import { choiceModelName } from '../../format'
import { effectiveChoice, failure, interrupt, isUnreachable, loadProviders, loadThread, refreshSummaries, setChoice, useStore } from '../../store'
import { ChatActions } from './ChatActions'
import { usePreviewFlow } from './usePreviewFlow'

interface ConversationProps {
  threadId: string
  openDrawer: () => void
  go: (id: string | null) => void
}

export function Conversation({ threadId, openDrawer, go }: ConversationProps) {
  const summaries = useStore((s) => s.summaries)
  const summary = summaries.find((t) => t.threadId === threadId)
  const thread = useStore((s) => s.threads[threadId])
  const providers = useStore((s) => s.providers)
  useStore((s) => s.choices[threadId])
  const choice = effectiveChoice(threadId)
  const pcDown = useStore((s) => s.pcDown)
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const coordinator = threadId === 'coordinator'
  const preview = usePreviewFlow(coordinator ? null : threadId, summary?.projectCwd || summary?.cwd)
  const { scroller, pinned, onScroll, jump } = useStickToBottom([thread?.blocks, thread?.busy], threadId)

  useEffect(() => {
    void loadThread(threadId)
    void loadProviders()
  }, [threadId])

  const busy = Boolean(thread?.busy)
  const title = coordinator ? 'Orchestrator' : summary?.title || 'Chat'
  const subtitle = summary?.projectName ? `${title} · ${summary.projectName}` : title

  const act = async (fn: () => Promise<unknown>) => {
    setMenu(false)
    setActionError(null)
    try {
      await fn()
      void refreshSummaries()
    } catch (e) {
      setActionError(failure(e))
    }
  }

  const header = (
    <TopBar
      onMenu={openDrawer}
      onNew={() => go(null)}
      onPreview={preview.open}
      model={
        <ModelSwitch
          label={choiceModelName(choice, providers)}
          icon={choice?.driver ? providerIcon(choice.driver) : undefined}
          usage={usageRatio(thread?.context)}
          onClick={() => setPicking(true)}
        />
      }
    >
      <button className="chat-title" onClick={() => setMenu(true)} aria-label={`${subtitle}. Chat actions`}>
        {subtitle}
      </button>
    </TopBar>
  )

  const dock = <Composer threadId={threadId} placeholder={busy ? 'Queue a message' : coordinator ? 'Describe the work' : 'Enter your text here....'} />

  const floating = (
    <>
      {pinned ? null : (
        <button className="jump chat-jump" aria-label="Jump to latest" onClick={jump}>
          <ArrowDown size={18} aria-hidden />
        </button>
      )}
      <HistoryScrubber chats={summaries} currentId={threadId} onPick={go} />
    </>
  )

  return (
    <div className="screen">
      <ChatFrame ref={scroller} header={header} dock={dock} floating={floating} onScroll={onScroll}>
        {thread?.error && !thread.loaded && !isUnreachable(thread.error) ? (
          <div className="feed">
            <StatusCard title="Couldn't load chat" action={{ label: 'Retry', onClick: () => void loadThread(threadId, true) }}>
              {thread.error}
            </StatusCard>
          </div>
        ) : null}
        {!thread?.loaded && (!thread?.error || isUnreachable(thread.error)) ? <div className="empty">Loading…</div> : null}
        {thread?.loaded && thread.blocks.length === 0 ? (
          <div className="empty">
            <strong>{coordinator ? 'Plan work across agents' : 'Nothing here yet'}</strong>
            {coordinator ? 'Describe the work. The orchestrator splits it up and starts agents.' : 'Send a message to continue.'}
          </div>
        ) : null}
        {thread?.loaded ? <Feed threadId={threadId} blocks={thread.blocks} turnMs={thread.turnMs} /> : null}
        {busy ? (
          <div className="feed" style={{ paddingTop: 0 }}>
            {pcDown ? (
              <div
                className="working paused"
                role="status"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 16,
                  background: 'rgba(255, 69, 58, 0.1)',
                  border: '1px solid rgba(255, 69, 58, 0.25)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'var(--danger, #ff453a)',
                  }}
                  aria-hidden
                />
                <span style={{ fontWeight: 500 }}>Connection lost — status paused</span>
                <button
                  type="button"
                  style={{
                    marginLeft: 'auto',
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 999,
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                  onClick={() => void act(() => interrupt(threadId))}
                >
                  Stop agent
                </button>
              </div>
            ) : (
              <div className="working" role="status">
                <span className="dot" aria-hidden />
                <span className="shimmer">Working</span>
                <Elapsed since={thread?.turnStartedAt} />
              </div>
            )}
          </div>
        ) : null}
        {actionError ? (
          <div className="feed">
            {isUnreachable(actionError) ? null : <StatusCard>{actionError}</StatusCard>}
          </div>
        ) : null}
      </ChatFrame>

      {picking ? (
        <ModelPicker value={choice} usage={usageRatio(thread?.context)} onChange={(c) => setChoice(threadId, c)} onClose={() => setPicking(false)} />
      ) : null}
      {preview.element}
      {menu ? (
        <ChatActions
          title={title}
          busy={busy}
          coordinator={coordinator}
          live={Boolean(summary?.live)}
          onStop={() => void act(() => interrupt(threadId))}
          onStartOver={() => void act(() => api.newConversation().then(() => loadThread(threadId, true)))}
          onEndAgent={() => void act(() => api.endAgent(threadId))}
          onClose={() => setMenu(false)}
        />
      ) : null}
    </div>
  )
}
