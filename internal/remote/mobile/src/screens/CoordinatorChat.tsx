import React, { useEffect, useState, useRef } from 'react'
import { RuntimeEvent, ServerMessage } from '../types'
import { api } from '../api'
import { mergeEvents, threadRunning } from '../events'
import { collapseFeed } from '../format'
import ChatBubble from '../components/ChatBubble'
import InputBar from '../components/InputBar'

interface Props {
  wsLastMessage: ServerMessage | null
  wsSend: (msg: object) => boolean
  pop?: () => void
  wsConnected?: boolean
  hideBack?: boolean
  bare?: boolean
}

function isCoordinatorThread(threadId: string): boolean {
  return threadId === 'coordinator' || threadId.startsWith('coordinator-')
}

export default function CoordinatorChat(props: Props) {
  const { wsLastMessage, wsSend } = props
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
      if (mounted) setError(e instanceof Error ? e.message : 'Failed to load history')
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

  const visible = collapseFeed(events)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {error && (
        <div style={{ margin: '8px 14px 0', padding: '9px 12px', borderRadius: 12, background: 'rgba(248,113,113,0.12)', border: '0.5px solid rgba(248,113,113,0.3)', fontSize: 13, color: '#fca5a5', overflowWrap: 'anywhere' }}>
          {error}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
        {loading && visible.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-mut)', fontSize: 13 }}>Loading messages...</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-pri)', fontSize: 21, fontWeight: 800, letterSpacing: '-0.01em' }}>
            What can I do for you?
            <div style={{ fontSize: 13.5, fontWeight: 400, color: 'var(--text-mut)', marginTop: 8 }}>
              Ask the coordinator to plan work across your projects.
            </div>
          </div>
        ) : (
          visible.map((ev, i) => (
            <ChatBubble
              key={`${ev.seq}-${i}`}
              event={ev}
              isUser={ev.kind === 'user.message'}
              onApprove={handleApprove}
              onAnswer={handleAnswer}
            />
          ))
        )}
        <div style={{ height: 12 }} />
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
