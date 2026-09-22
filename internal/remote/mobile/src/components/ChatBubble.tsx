import React, { useState } from 'react'
import { RuntimeEvent } from '../types'
import { formatTime } from '../utils'
import { cleanOutput, summarizeToolInput, isNoiseResult } from '../format'
import Markdown from './Markdown'

interface ChatBubbleProps {
  event: RuntimeEvent
  isUser?: boolean
  onApprove?: (requestId: string, decision: string) => void
  onAnswer?: (requestId: string, answers: string[]) => void
}

export default function ChatBubble({ event, isUser = false, onApprove, onAnswer }: ChatBubbleProps) {
  const { kind, text, at, tool, plan, approval, question, error } = event

  switch (kind) {
    case 'user.message':
      if (!text) return null
      return (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '5px 14px 5px 56px', maxWidth: '100%' }}>
          <div style={{ maxWidth: '100%', background: 'rgba(255,255,255,0.13)', borderRadius: 22, padding: '9px 15px', minWidth: 0 }}>
            <div style={{ fontSize: 16, lineHeight: 1.5, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              <Markdown content={text} />
            </div>
          </div>
        </div>
      )

    case 'agent.message':
      if (!text) return null
      return (
        <div style={{ padding: '5px 18px', maxWidth: '100%', minWidth: 0 }}>
          <div style={{ fontSize: 16, lineHeight: 1.62, color: 'var(--text-pri)' }}>
            <Markdown content={text} />
          </div>
        </div>
      )

    case 'agent.thought':
      if (!text) return null
      return (
        <div style={{ padding: '2px 18px', fontSize: 13, fontStyle: 'italic', color: 'var(--text-mut)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {text.length > 200 ? text.slice(0, 200) + '…' : text}
        </div>
      )

    case 'tool.call': {
      const summary = summarizeToolInput(tool?.input)
      return (
        <div style={{ padding: '3px 18px', display: 'flex', alignItems: 'baseline', gap: 7, maxWidth: '100%' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
            {tool?.name || 'Tool'}
          </span>
          {!!summary && (
            <span style={{ fontSize: 13, color: 'var(--text-mut)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {summary}
            </span>
          )}
        </div>
      )
    }

    case 'tool.result': {
      const raw = tool?.output ?? text ?? ''
      if (isNoiseResult(raw)) return null
      return (
        <div style={{ margin: '4px 18px', padding: '9px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.045)', border: '0.5px solid var(--border-div)', maxWidth: '100%' }}>
          <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-sec)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
            {cleanOutput(raw, 800)}
          </div>
        </div>
      )
    }

    case 'plan': {
      if (!plan || plan.length === 0) return null
      return (
        <div style={{ padding: '5px 18px', maxWidth: '100%' }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>Plan updated</div>
          <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--text-sec)', fontSize: 14, lineHeight: 1.55 }}>
            {plan.map((p, i) => (
              <li key={i} style={{ marginBottom: 2, overflowWrap: 'anywhere' }}>{p.content}</li>
            ))}
          </ul>
        </div>
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
    case 'turn.completed':
      return null

    case 'session.stopped':
      return <Centered text="Session ended" />

    case 'turn.failed': {
      const raw = error || text || 'Turn failed'
      const friendly = raw.includes('no active session')
        ? 'This agent has finished and can no longer receive messages. Start a new task from its project to continue.'
        : raw.includes('session_ended')
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
      return <Centered text={cleanOutput(error || text || kind, 300)} />

    default:
      if (text) {
        return (
          <div style={{ padding: '5px 18px', fontSize: 15, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
            <Markdown content={text} />
          </div>
        )
      }
      return null
  }
}

export function Time({ at, light }: { at: number; light?: boolean }) {
  return (
    <span style={{ fontSize: 11, color: light ? 'rgba(255,255,255,0.7)' : 'var(--text-mut)' }}>
      {formatTime(at)}
    </span>
  )
}

function Centered({ text, color = 'var(--text-mut)' }: { text: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 24px', maxWidth: '100%' }}>
      <div className="glass" style={{ fontSize: 12.5, fontWeight: 600, color, borderRadius: 16, padding: '5px 13px', textAlign: 'center', maxWidth: '100%', overflowWrap: 'anywhere' }}>
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
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 14px', maxWidth: '100%' }}>
      <div className="glass" style={{ width: '100%', borderRadius: 20, padding: '13px 14px', borderColor: 'rgba(255,214,10,0.35)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.06em', marginBottom: 4 }}>PERMISSION NEEDED</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 3, overflowWrap: 'anywhere' }}>{event.approval?.title || 'Permission Request'}</div>
        {!!event.approval?.detail && <div style={{ fontSize: 13.5, color: 'var(--text-sec)', marginBottom: 10, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{event.approval.detail}</div>}
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
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 14px', maxWidth: '100%' }}>
      <div className="glass" style={{ width: '100%', borderRadius: 20, padding: '13px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 8 }}>QUESTION</div>
        {questions.map((q, qi) => (
          <div key={qi} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 7, overflowWrap: 'anywhere' }}>{q.question}</div>
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
                  overflowWrap: 'anywhere',
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
