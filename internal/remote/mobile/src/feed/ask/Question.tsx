import { useState } from 'react'
import { HelpCircle, MessageCircleQuestion } from 'lucide-react'
import { api } from '../../api'
import type { AgentStreamBlock } from '../types'
import { AskCard, AskDone } from './AskCard'
import { AskButton, AskOption } from './AskButton'

type QuestionBlock = Extract<AgentStreamBlock, { type: 'tool_question' }>

export function Question({ threadId, block }: { threadId: string; block: QuestionBlock }) {
  const items = block.items?.length ? block.items : [{ question: block.question, options: block.options }]
  const [picked, setPicked] = useState<Record<number, string>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = block.id.replace(/^question-/, '')

  if (block.answered || sent) {
    const answer = block.selectedAnswer && block.selectedAnswer !== 'Answered' ? block.selectedAnswer : null
    return <AskDone icon={HelpCircle}>{answer ? `Answered · ${answer}` : 'Answered'}</AskDone>
  }

  const answers = items.map((item, i) => {
    const option = item.options.find((o) => o.key === picked[i])
    if (option?.isCustomInput) return (custom[i] || '').trim()
    return option?.label ?? ''
  })
  const complete = answers.every((a) => a)
  const pick = (i: number, key: string) => setPicked((p) => ({ ...p, [i]: key }))

  const submit = async (skip = false) => {
    setSent(true)
    setError(null)
    try {
      await api.answer(threadId, requestId, skip ? [] : answers)
    } catch (e) {
      setSent(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <AskCard icon={MessageCircleQuestion} label="Question">
      {items.map((item, i) => (
        <div key={i} className="ask-group">
          <div className="ask-card-title">{item.question}</div>
          {item.options.map((o) =>
            o.isCustomInput ? (
              <AskOption key={o.key} as="div" selected={picked[i] === o.key} onSelect={() => pick(i, o.key)}>
                <input
                  className="ask-input"
                  value={custom[i] || ''}
                  onFocus={() => pick(i, o.key)}
                  onChange={(e) => setCustom((c) => ({ ...c, [i]: e.target.value }))}
                  placeholder="Your own answer"
                  aria-label="Your own answer"
                />
              </AskOption>
            ) : (
              <AskOption key={o.key} selected={picked[i] === o.key} onSelect={() => pick(i, o.key)}>
                {o.label}
              </AskOption>
            ),
          )}
        </div>
      ))}
      <div className="ask-card-actions">
        <AskButton onClick={() => void submit(true)}>Skip</AskButton>
        <AskButton tone="primary" grow disabled={!complete} onClick={() => void submit()}>
          Send
        </AskButton>
      </div>
      {error ? <div className="ask-card-error">{error}</div> : null}
    </AskCard>
  )
}
