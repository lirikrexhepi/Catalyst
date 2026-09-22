import React, { useState } from 'react'
import { RuntimeEvent } from '../types'
import { formatTime } from '../utils'

interface ChatBubbleProps {
  event: RuntimeEvent
  isUser?: boolean
  grouped?: boolean
  onApprove?: (requestId: string, decision: string) => void
  onAnswer?: (requestId: string, answers: string[]) => void
}

const BUBBLE_MAX = '78%'

function Outgoing({ text, at }: { text?: string; at: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '1.5px 12px 1.5px 60px' }}>
      <div style={{ position: 'relative', maxWidth: BUBBLE_MAX, background: 'linear-gradient(180deg, #1f9bf0, #0a84ff)', borderRadius: '18px 18px 5px 18px', padding: '8px 11px 7px', boxShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>
        <span style={{ fontSize: 16, lineHeight: 1.4, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
          <span style={{ display: 'inline-block', width: 44 }} />
        </span>
        <span style={{ position: 'absolute', right: 9, bottom: 6, fontSize: 11, color: 'rgba(255,255,255,0.75)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {formatTime(at)}
          <svg width="15" height="10" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 6.5L4.5 9.5 11 2.5" />
            <path d="M7 7.5l2.5 2.5L17 3" />
          </svg>
        </span>
      </div>
    </div>
  )
}

function Incoming({ children, at }: { children: React.ReactNode; at: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '1.5px 60px 1.5px 12px' }}>
      <div style={{ position: 'relative', maxWidth: BUBBLE_MAX, background: 'rgba(38,38,42,0.92)', borderRadius: '5px 18px 18px 18px', padding: '8px 11px 7px', boxShadow: '0 1px 1px rgba(0,0,0,0.35)' }}>
        <div style={{ fontSize: 16, lineHeight: 1.4, color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {children}
          <span style={{ display: 'inline-block', width: 38 }} />
        </div>
        <span style={{ position: 'absolute', right: 9, bottom: 6, fontSize: 11, color: 'var(--text-mut)' }}>
          {formatTime(at)}
        </span>
      </div>
    </div>
  )
}

export default function ChatBubble({ event, isUser = false, onApprove, onAnswer }: ChatBubbleProps) {
  const { kind, text, at, tool, plan, approval, question, error } = event

  switch (kind) {
    case 'user.message':
      if (!text) return null
      return <Outgoing text={text} at={at} />

    case 'agent.message':
      if (!text) return null
      return <Incoming at={at}>{text}</Incoming>

    case 'agent.thought':
      if (!text) return null
      return (
        <div style={{ padding: '3px 16px', fontSize: 13.5, fontStyle: 'italic', color: 'var(--text-mut)', lineHeight: 1.45 }}>
          {text.length > 220 ? text.slice(0, 220) + '…' : text}
        </div>
      )

    case 'tool.call':
      return (
        <Incoming at={at}>
          <span style={{ display: 'block', color: 'var(--accent)', fontSize: 12, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 3 }}>
            {tool?.name || 'Tool'}
          </span>
          <span style={{ color: 'var(--text-mut)', fontSize: 13.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {JSON.stringify(tool?.input || {})}
          </span>
        </Incoming>
      )

    case 'tool.result':
      return (
        <div style={{ padding: '2px 16px', fontSize: 13, color: 'var(--text-mut)' }}>
          {tool?.output ? (tool.output.length > 140 ? tool.output.slice(0, 140) + '…' : tool.output) : 'Done'}
        </div>
      )

    case 'plan': {
      if (!plan || plan.length === 0) return null
      return (
        <Incoming at={at}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Plan updated</span>
          <ul style={{ paddingLeft: 17, margin: 0, color: 'var(--text-sec)', fontSize: 14 }}>
            {plan.map((p, i) => (
              <li key={i} style={{ marginBottom: 2 }}>{p.content}</li>
            ))}
          </ul>
        </Incoming>
      )
    }

    case 'approval.request':
      return <ApprovalView event={event} onApprove={onApprove} />

    case 'approval.resolved':
      return <Centered text={`Permission ${text === 'deny' || text === 'reject' || text === 'cancel' ? 'denied' : 'approved'}`} />

    case 'question.asked':
      return <QuestionView event={event} onAnswer={onAnswer} />

    case 'question.answered':
      return <Centered text="Answered" />

    case 'turn.started':
    case 'session.started':
      return null

    case 'session.stopped':
      return <Centered text="Session ended" />

    case 'turn.completed':
      return null

    case 'turn.failed': {
      const raw = error || text || 'Turn failed'
      const friendly = raw.includes('no active session')
        ? 'This agent has finished and can no longer receive messages. Start a new task from its project to continue.'
        : raw
      return <Centered text={friendly} color="#ff6961" />
    }

    case 'notice':
      if (!text) return null
      return <Centered text={text} />

    case 'rate.limit':
      return <Centered text={error || text || 'Rate limited — waiting'} color="var(--amber)" />

    case 'diagnostic':
    case 'provider.status':
    case 'usage':
      if (!text && !error) return null
      return <Centered text={error || text || kind} />

    default:
      if (text) return <Incoming at={at}>{text}</Incoming>
      return null
  }
}

function Centered({ text, color = 'var(--text-mut)' }: { text: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 24px' }}>
      <div className="glass" style={{ fontSize: 12.5, fontWeight: 600, color, borderRadius: 16, padding: '5px 13px', textAlign: 'center', maxWidth: '88%' }}>
        {text}
      </div>
    </div>
  )
}

function ApprovalView({ event, onApprove }: { event: RuntimeEvent; onApprove?: (requestId: string, decision: string) => void }) {
  const [done, setDone] = useState<string | null>(null)
  const reqId = event.approval?.requestId || ''
  const options = event.approval?.options?.length
    ? event.approval.options
    : [
        { id: 'once', name: 'Allow once', kind: 'allowOnce' },
        { id: 'always', name: 'Always allow', kind: 'allowAlways' },
        { id: 'reject', name: 'Deny', kind: 'deny' },
      ]

  const choose = (kind: string) => {
    if (done || !reqId) return
    setDone(kind)
    onApprove?.(reqId, kind)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 12px' }}>
      <div className="glass" style={{ width: '100%', maxWidth: 340, borderRadius: 20, padding: '13px 14px', borderColor: 'rgba(255,214,10,0.35)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.06em', marginBottom: 4 }}>PERMISSION NEEDED</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 3 }}>{event.approval?.title || 'Permission Request'}</div>
        {!!event.approval?.detail && <div style={{ fontSize: 13.5, color: 'var(--text-sec)', marginBottom: 10, lineHeight: 1.4 }}>{event.approval.detail}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => choose(o.kind)}
              disabled={done !== null}
              style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 14,
                fontSize: 13.5,
                fontWeight: 700,
                background: done === o.kind ? 'var(--accent)' : 'rgba(255,255,255,0.09)',
                color: '#fff',
                opacity: done && done !== o.kind ? 0.45 : 1,
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function QuestionView({ event, onAnswer }: { event: RuntimeEvent; onAnswer?: (requestId: string, answers: string[]) => void }) {
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)
  const reqId = event.question?.requestId || ''
  const questions = event.question?.questions || []

  if (questions.length === 0) return null

  const submit = () => {
    if (sent || !reqId) return
    setSent(true)
    onAnswer?.(reqId, questions.map((_, i) => selected[i] || ''))
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 12px' }}>
      <div className="glass" style={{ width: '100%', maxWidth: 340, borderRadius: 20, padding: '13px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 8 }}>QUESTION</div>
        {questions.map((q, qi) => (
          <div key={qi} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 7 }}>{q.question}</div>
            {(q.options || []).map(opt => (
              <button
                key={opt}
                onClick={() => !sent && setSelected(s => ({ ...s, [qi]: opt }))}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: 13,
                  fontSize: 14,
                  marginBottom: 6,
                  background: selected[qi] === opt ? 'var(--accent)' : 'rgba(255,255,255,0.09)',
                  color: '#fff',
                  fontWeight: selected[qi] === opt ? 700 : 400,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        ))}
        <button
          onClick={submit}
          disabled={sent}
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 14,
            fontSize: 14.5,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            opacity: sent ? 0.5 : 1,
          }}
        >
          {sent ? 'Sent' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
