import React, { useState } from 'react'
import { RuntimeEvent } from '../types'
import { formatTime } from '../utils'

interface ChatBubbleProps {
  event: RuntimeEvent
  isUser?: boolean
  onApprove?: (requestId: string, decision: string) => void
  onAnswer?: (requestId: string, answers: string[]) => void
}

export default function ChatBubble({ event, isUser = false, onApprove, onAnswer }: ChatBubbleProps) {
  const { kind, text, at, tool, plan, approval, question, error } = event

  const renderBubble = (content: React.ReactNode, isRight: boolean, isDim: boolean = false, small: boolean = false) => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isRight ? 'flex-end' : 'flex-start',
      margin: '12px 16px'
    }}>
      <div style={{
        background: isRight ? 'rgba(56,189,248,0.15)' : (isDim ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)'),
        borderRadius: isRight ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
        padding: '10px 14px',
        color: isDim ? 'var(--text-mut)' : 'white',
        fontSize: small ? 13 : 15,
        fontStyle: isDim ? 'italic' : 'normal',
        maxWidth: '85%',
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap'
      }}>
        {content}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mut)', marginTop: 4, padding: '0 4px' }}>
        {formatTime(at)}
      </div>
    </div>
  )

  const renderCentered = (content: React.ReactNode, color: string = 'var(--text-mut)') => (
    <div style={{
      textAlign: 'center',
      fontSize: 12,
      color,
      margin: '16px',
      fontWeight: 500
    }}>
      {content}
    </div>
  )

  switch (kind) {
    case 'user.message':
      return renderBubble(text, true)

    case 'agent.message':
      if (!text) return null
      return renderBubble(text, false)

    case 'agent.thought':
      if (!text) return null
      return renderBubble(text, false, true, true)

    case 'tool.call':
      return renderBubble(
        <div>
          <div style={{ color: 'var(--accent)', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
            {tool?.name || 'Tool'}
          </div>
          <div style={{ color: 'var(--text-mut)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {JSON.stringify(tool?.input || {})}
          </div>
        </div>,
        false
      )

    case 'tool.result':
      return renderBubble(
        <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>
          {tool?.output ? (tool.output.length > 100 ? tool.output.substring(0, 100) + '...' : tool.output) : 'Done'}
        </div>,
        false,
        true
      )

    case 'plan':
      if (!plan || plan.length === 0) return null
      return renderBubble(
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Plan Updated</div>
          <ul style={{ paddingLeft: 16, margin: 0, color: 'var(--text-sec)' }}>
            {plan.map((p, i) => (
              <li key={i}>{p.content}</li>
            ))}
          </ul>
        </div>,
        false
      )

    case 'approval.request':
      return <ApprovalView event={event} onApprove={onApprove} />

    case 'approval.resolved':
      return renderCentered(`Permission ${text === 'deny' || text === 'reject' || text === 'cancel' ? 'denied' : 'approved'}`)

    case 'question.asked':
      return <QuestionView event={event} onAnswer={onAnswer} />

    case 'question.answered':
      return renderCentered('Answered')

    case 'turn.started':
    case 'session.started':
      return renderCentered('Session started')

    case 'session.stopped':
      return renderCentered('Session stopped')

    case 'turn.completed':
      return renderCentered('Turn completed')

    case 'turn.failed':
      return renderCentered(error || text || 'Turn failed', '#f87171')

    case 'notice':
      if (!text) return null
      return renderCentered(text)

    case 'rate.limit':
    case 'diagnostic':
    case 'provider.status':
    case 'usage':
      if (!text && !error) return null
      return renderCentered(error || text || kind, kind === 'rate.limit' ? '#fbbf24' : undefined)

    default:
      if (text) return renderBubble(text, false, true, true)
      return null
  }
}

function ApprovalView({ event, onApprove }: { event: RuntimeEvent; onApprove?: (requestId: string, decision: string) => void }) {
  const [done, setDone] = useState<string | null>(null)
  const reqId = event.approval?.requestId || ''
  const options = event.approval?.options?.length
    ? event.approval.options
    : [
        { id: 'once', name: 'Allow once', kind: 'allowOnce' as const },
        { id: 'always', name: 'Always allow', kind: 'allowAlways' as const },
        { id: 'reject', name: 'Deny', kind: 'deny' as const },
      ]

  const choose = (kind: string) => {
    if (done || !reqId) return
    setDone(kind)
    onApprove?.(reqId, kind)
  }

  return (
    <div style={{ margin: '12px 16px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>PERMISSION NEEDED</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{event.approval?.title || 'Permission Request'}</div>
      {!!event.approval?.detail && <div style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 8 }}>{event.approval.detail}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => choose(o.kind)}
            disabled={done !== null}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: done === o.kind ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              color: 'white',
              cursor: done ? 'default' : 'pointer',
              opacity: done && done !== o.kind ? 0.5 : 1
            }}
          >
            {o.name}
          </button>
        ))}
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
    const answers = questions.map((_, i) => selected[i] || '')
    setSent(true)
    onAnswer?.(reqId, answers)
  }

  return (
    <div style={{ margin: '12px 16px', background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>QUESTION</div>
      {questions.map((q, qi) => (
        <div key={qi} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{q.question}</div>
          {(q.options || []).map(opt => (
            <button
              key={opt}
              onClick={() => !sent && setSelected(s => ({ ...s, [qi]: opt }))}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 6,
                background: selected[qi] === opt ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                color: 'white',
                cursor: sent ? 'default' : 'pointer'
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
          padding: '8px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          background: 'var(--accent)',
          color: 'white',
          cursor: sent ? 'default' : 'pointer',
          opacity: sent ? 0.5 : 1
        }}
      >
        {sent ? 'Sent' : 'Submit'}
      </button>
    </div>
  )
}
