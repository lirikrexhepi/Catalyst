import React, { useEffect, useState, useRef } from 'react'
import { RuntimeEvent, ServerMessage } from '../types'
import { api } from '../api'
import { mergeEvents, threadRunning } from '../events'
import { collapseFeed } from '../format'
import ChatBubble from '../components/ChatBubble'
import InputBar from '../components/InputBar'

interface Props {
  threadId: string
  title: string
  pop: () => void
  wsLastMessage: ServerMessage | null
  wsSend: (msg: object) => boolean
  wsConnected: boolean
  bare?: boolean
}

export default function AgentChat(props: Props) {
  const { threadId, title, wsLastMessage, wsSend } = props;
  const [events, setEvents] = useState<RuntimeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api.agentHistory(threadId).then(hist => {
      if (mounted) setEvents(Array.isArray(hist) ? hist : [])
    }).catch((e) => {
      if (mounted) setError(e?.message || 'Failed to load history')
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [threadId])

  useEffect(() => {
    const ev = wsLastMessage?.event
    if (wsLastMessage?.type === 'event' && ev && ev.threadId === threadId) {
      setEvents(prev => mergeEvents(prev, ev))
    }
  }, [wsLastMessage, threadId])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  const isRunning = threadRunning(events)

  const handleSend = async (text: string) => {
    setError(null)
    const optimistic: RuntimeEvent = {
      kind: 'user.message', threadId, text,
      seq: Date.now(), at: Date.now(),
    } as RuntimeEvent
    setEvents(prev => [...prev, optimistic])
    setSending(true)
    try {
      await api.sendAgent(threadId, text)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Send failed'
      if (msg.includes('session_ended')) {
        setError('This agent has finished and can no longer receive messages. Start a new task from its project to continue.')
      } else {
        const ok = wsSend({ action: 'send_agent', threadId, text })
        if (!ok) setError(msg)
      }
    } finally {
      setSending(false)
    }
  }

  const handleStop = async () => {
    try {
      await api.stopAgent(threadId)
    } catch {
      wsSend({ action: 'stop_agent', threadId })
    }
  }

  const handleApprove = async (requestId: string, decision: string) => {
    try {
      await api.approve(threadId, requestId, decision)
    } catch (e) {
      const ok = wsSend({ action: 'approve', threadId, requestId, decision })
      if (!ok) setError(e instanceof Error ? e.message : 'Approval failed')
    }
  }

  const handleAnswer = async (requestId: string, answers: string[]) => {
    try {
      await api.answerQuestion(threadId, requestId, answers)
    } catch (e) {
      const ok = wsSend({ action: 'answer_question', threadId, requestId, answers })
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
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-mut)', fontSize: 14, lineHeight: 1.5 }}>
            Start a new conversation
            <div style={{ fontSize: 12.5, marginTop: 6 }}>Ask {title} anything below.</div>
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
