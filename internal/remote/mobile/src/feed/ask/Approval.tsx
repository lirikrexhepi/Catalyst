import { useState } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import { api } from '../../api'
import type { AgentStreamBlock } from '../types'
import { AskCard, AskDone } from './AskCard'
import { AskButton } from './AskButton'

type ApprovalBlock = Extract<AgentStreamBlock, { type: 'approval_request' }>

const FALLBACK = [
  { id: 'once', name: 'Allow', kind: 'allowOnce' },
  { id: 'always', name: 'Always', kind: 'allowAlways' },
  { id: 'reject', name: 'Deny', kind: 'deny' },
]

export function Approval({ threadId, block }: { threadId: string; block: ApprovalBlock }) {
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resolved = block.status === 'resolved' || block.status === 'denied'
  const denied = block.status === 'denied' || sent === 'deny'

  const answer = async (kind: string) => {
    setSent(kind)
    setError(null)
    try {
      await api.approve(threadId, block.requestID, kind)
    } catch (e) {
      setSent(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (resolved || sent) {
    return <AskDone icon={denied ? X : Check}>{`${denied ? 'Denied' : 'Allowed'} · ${block.title}`}</AskDone>
  }

  const options = block.options.length ? block.options : FALLBACK
  return (
    <AskCard icon={ShieldCheck} label="Permission">
      <div className="ask-card-title">{block.title}</div>
      {block.detail ? <pre className="ask-card-detail">{block.detail}</pre> : null}
      <div className="ask-card-actions">
        {options.map((o) => {
          const kind = o.kind || o.id
          const deny = kind === 'deny' || o.id === 'reject'
          const primary = kind === 'allowOnce' || o.id === 'once'
          return (
            <AskButton key={o.id} grow tone={primary ? 'primary' : deny ? 'danger' : undefined} onClick={() => void answer(kind)}>
              {o.name}
            </AskButton>
          )
        })}
      </div>
      {error ? <div className="ask-card-error">{error}</div> : null}
    </AskCard>
  )
}
