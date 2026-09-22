import React, { useEffect, useState, useRef } from 'react'
import { RuntimeEvent, ServerMessage } from '../types'
import { api } from '../api'
import { mergeEvents, threadRunning } from '../events'
import NavHeader from '../components/NavHeader'
import ChatBubble from '../components/ChatBubble'
import InputBar from '../components/InputBar'

interface Props {
  projectName?: string
  pop: () => void
  wsLastMessage: ServerMessage | null
  wsSend: (msg: object) => boolean
  wsConnected: boolean
  hideBack?: boolean
}

function isCoordinatorThread(threadId: string): boolean {
  return threadId === 'coordinator' || threadId.startsWith('coordinator-')
}

export default function CoordinatorChat({ projectName, pop, wsLastMessage, wsSend, wsConnected, hideBack }: Props) {
  const [events, setEvents] = useState<RuntimeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api.history().then(hist => {
      if (mounted) setEvents(Array.isArray(hist) ? hist : [])
    }).catch((e) => {
      if (mounted) setError(e?.message || 'Failed to load history')
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const ev = wsLastMessage?.event
    if (wsLastMessage?.type === 'event' && ev && isCoordinatorThread(ev.threadId)) {
      setEvents(prev => mergeEvents(prev, ev))
    }
  }, [wsLastMessage])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  const isRunning = threadRunning(events)

  const handleSend = async (text: string) => {
    setError(null)
    const optimistic: RuntimeEvent = {
      kind: 'user.message', threadId: 'coordinator', text,
      seq: Date.now(), at: Date.now(),
    } as RuntimeEvent
    setEvents(prev => [...prev, optimistic])
    setSending(true)
    try {
      await api.sendCoordinator(text)
    } catch (e: unknown) {
      const ok = wsSend({ action: 'send_coordinator', text })
      if (!ok) setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const handleStop = async () => {
    try {
      await api.interruptCoordinator()
    } catch {
      wsSend({ action: 'interrupt_coordinator' })
    }
  }

  const handleApprove = async (requestId: string, decision: string) => {
    try {
      await api.approve('coordinator', requestId, decision)
    } catch (e) {
      const ok = wsSend({ action: 'approve', threadId: 'coordinator', requestId, decision })
      if (!ok) setError(e instanceof Error ? e.message : 'Approval failed')
    }
  }

  const handleAnswer = async (requestId: string, answers: string[]) => {
    try {
      await api.answerQuestion('coordinator', requestId, answers)
    } catch (e) {
      const ok = wsSend({ action: 'answer_question', threadId: 'coordinator', requestId, answers })
      if (!ok) setError(e instanceof Error ? e.message : 'Answer failed')
    }
  }

  const title = projectName ? `Coordinator — ${projectName}` : 'Coordinator'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavHeader
        title={title}
        onBack={hideBack ? undefined : pop}
        subtitle={wsConnected ? undefined : 'offline — reconnecting'}
        rightAction={
          wsConnected
            ? <span className="live-dot" />
            : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
        }
      />

      {error && (
        <div style={{ margin: '8px 16px 0', padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', fontSize: 12, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }} />
        {loading && events.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-mut)', fontSize: 13 }}>Loading messages...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-mut)', fontSize: 13 }}>No messages yet. Send the first task below.</div>
        ) : (
          events.map((ev, i) => (
            <ChatBubble
              key={`${ev.seq}-${i}`}
              event={ev}
              isUser={ev.kind === 'user.message'}
              onApprove={handleApprove}
              onAnswer={handleAnswer}
            />
          ))
        )}
        <div style={{ height: 16 }} />
      </div>

      <InputBar
        onSend={handleSend}
        onStop={handleStop}
        isRunning={isRunning}
        disabled={sending}
      />
    </div>
  )
}
