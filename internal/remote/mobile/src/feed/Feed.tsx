import React, { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileEdit,
  FileText,
  GitBranch,
  Hand,
  ListChecks,
  Loader2,
  HelpCircle,
  Search,
  ShieldQuestion,
  Terminal,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import Markdown from '../components/Markdown'
import { api } from '../api'
import { basename, dirname, duration } from '../format'
import type { AgentStreamBlock, ToolGroupItem } from './types'

type Block = AgentStreamBlock

interface FeedProps {
  threadId: string
  blocks: Block[]
  turnMs: Record<string, number>
}

/** The conversation, one memoised component per block. */
export default function Feed({ threadId, blocks, turnMs }: FeedProps) {
  return (
    <div className="feed">
      {blocks.map((block) => (
        <React.Fragment key={block.id}>
          <BlockView threadId={threadId} block={block} />
          {turnMs[block.id] !== undefined && <div className="turn-end">took {duration(turnMs[block.id])}</div>}
        </React.Fragment>
      ))}
    </div>
  )
}

const BlockView = React.memo(function BlockView({ threadId, block }: { threadId: string; block: Block }) {
  switch (block.type) {
    case 'user':
      return (
        <div className={`bubble-user${block.pending ? ' pending' : ''}`}>
          {block.content}
          {block.files && block.files.length > 0 && (
            <div className="files">
              {block.files.map((f) => (
                <span className="chip-file" key={f.path}>
                  {f.name || basename(f.path)}
                </span>
              ))}
            </div>
          )}
        </div>
      )

    case 'notice':
      return <div className="notice">{block.label}</div>

    case 'text':
      if (block.variant === 'error') {
        return <div className="say error" role="alert">{block.content.replace(/^⚠\s*/, '')}</div>
      }
      return (
        <div className="say">
          <Markdown content={block.content} />
          {block.isStreaming && <span className="caret" aria-hidden="true" />}
        </div>
      )

    case 'thinking':
      return <Thought thinking={block.isThinking} text={block.thoughtText} />

    case 'tool_group':
      return (
        <div className="acts">
          {block.items.map((item, i) => (
            <Activity key={item.id || i} item={item} />
          ))}
        </div>
      )

    case 'tool_bash':
      return (
        <div className="acts">
          <Activity item={{ type: 'bash', action: 'Ran', target: block.command, details: block.output, status: block.status }} />
        </div>
      )

    case 'tool_search':
      return (
        <div className="acts">
          <Activity
            item={{
              type: 'search',
              action: 'Searched',
              target: block.query || '',
              details: block.files?.join('\n'),
              status: block.isSearching ? 'running' : 'completed',
            }}
          />
        </div>
      )

    case 'tool_edit':
      return <EditCard block={block} />

    case 'tool_todo':
      return <Todos block={block} />

    case 'tool_question':
      return <Question threadId={threadId} block={block} />

    case 'approval_request':
      return <Approval threadId={threadId} block={block} />

    case 'tool_plan':
      return (
        <div className="say">
          <Markdown content={`**${block.title}**\n\n${block.summary}`} />
        </div>
      )

    default:
      return null
  }
})

function Thought({ thinking, text }: { thinking: boolean; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button className="thought" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        <span className={thinking ? 'shimmer' : undefined}>{thinking ? 'Thinking' : 'Thought'}</span>
      </button>
      {open && text && <div className="thought-body">{text}</div>}
    </div>
  )
}

const ACT_ICON: Record<ToolGroupItem['type'], LucideIcon> = {
  read: FileText,
  bash: Terminal,
  search: Search,
  edit: FileEdit,
  write: FileEdit,
  git: GitBranch,
  generic: Wrench,
}

function Activity({ item }: { item: ToolGroupItem }) {
  const [open, setOpen] = useState(false)
  const Icon = ACT_ICON[item.type] ?? Wrench
  const hasOut = Boolean(item.details && item.details.trim())
  const status = item.status ?? 'completed'
  return (
    <>
      <button
        className="act"
        data-status={status}
        onClick={() => hasOut && setOpen((v) => !v)}
        aria-expanded={hasOut ? open : undefined}
        disabled={!hasOut}
        style={{ opacity: 1 }}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="verb">{item.action}</span>
        {item.target && <span className="target">{item.target}</span>}
        <span className="st" aria-label={status}>
          {status === 'running' ? (
            <Loader2 size={14} className="spin" aria-hidden="true" />
          ) : status === 'error' ? (
            <X size={14} aria-hidden="true" />
          ) : hasOut ? (
            open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />
          ) : (
            <Check size={14} aria-hidden="true" />
          )}
        </span>
      </button>
      {open && hasOut && <div className="out">{item.details!.slice(0, 20000)}</div>}
    </>
  )
}

function EditCard({ block }: { block: Extract<Block, { type: 'tool_edit' }> }) {
  const lines = block.diffLines ?? []
  const [open, setOpen] = useState(lines.length > 0 && lines.length <= 30)
  const running = block.status === 'running'
  return (
    <div className="card">
      <button className="card-head" onClick={() => lines.length > 0 && setOpen((v) => !v)} aria-expanded={open}>
        {running ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <FileEdit size={18} aria-hidden="true" />}
        <div className="file">
          <div className="name">{basename(block.filePath)}</div>
          {dirname(block.filePath) && <div className="dir">{dirname(block.filePath)}</div>}
        </div>
        <span className="stat" aria-label={`${block.additions ?? 0} lines added, ${block.deletions ?? 0} removed`}>
          <span className="a">+{block.additions ?? 0}</span>
          <span className="d">−{block.deletions ?? 0}</span>
        </span>
        {lines.length > 0 && (open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />)}
      </button>
      {open && lines.length > 0 && (
        <div className="diff">
          {lines.map((line, i) => (
            <div key={i} className={`diff-line ${line.type}`}>
              <span className="ln">{line.lineNum || ''}</span>
              <span className="mk">{line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ''}</span>
              <span>{line.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Todos({ block }: { block: Extract<Block, { type: 'tool_todo' }> }) {
  const done = block.todos.filter((t) => t.status === 'completed').length
  return (
    <div className="card todo">
      <div className="todo-h">
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ListChecks size={16} aria-hidden="true" /> Plan
        </span>
        <span className="when">
          {done} of {block.todos.length}
        </span>
      </div>
      {block.todos.map((t) => (
        <div className="todo-item" data-status={t.status} key={t.id}>
          {t.status === 'completed' ? (
            <Check size={16} aria-hidden="true" />
          ) : t.status === 'in_progress' ? (
            <Loader2 size={16} className="spin" aria-hidden="true" />
          ) : (
            <CircleDashed size={16} aria-hidden="true" />
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

function Approval({ threadId, block }: { threadId: string; block: Extract<Block, { type: 'approval_request' }> }) {
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
    return (
      <div className="ask-done">
        {denied ? <X size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        {denied ? 'Denied' : 'Allowed'}: {block.title}
      </div>
    )
  }

  const options = block.options.length
    ? block.options
    : [
        { id: 'once', name: 'Allow once', kind: 'allowOnce' },
        { id: 'always', name: 'Always allow', kind: 'allowAlways' },
        { id: 'reject', name: 'Deny', kind: 'deny' },
      ]
  return (
    <div className="ask" role="group" aria-label="Permission request">
      <div className="ask-h">
        <ShieldQuestion size={16} aria-hidden="true" /> Wants permission
      </div>
      <div className="ask-title">{block.title}</div>
      {block.detail && <div className="ask-detail">{block.detail}</div>}
      <div className="ask-actions">
        {options.map((o) => {
          const kind = o.kind || o.id
          const deny = kind === 'deny' || o.id === 'reject'
          const primary = kind === 'allowOnce' || o.id === 'once'
          return (
            <button
              key={o.id}
              className={`btn grow${primary ? ' call' : ''}${deny ? ' danger' : ''}`}
              onClick={() => void answer(kind)}
            >
              {o.name}
            </button>
          )
        })}
      </div>
      {error && <div className="say error">{error}</div>}
    </div>
  )
}

function Question({ threadId, block }: { threadId: string; block: Extract<Block, { type: 'tool_question' }> }) {
  const items = block.items?.length ? block.items : [{ question: block.question, options: block.options }]
  const [picked, setPicked] = useState<Record<number, string>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = block.id.replace(/^question-/, '')

  if (block.answered || sent) {
    return (
      <div className="ask-done">
        <HelpCircle size={16} aria-hidden="true" />
        {block.selectedAnswer && block.selectedAnswer !== 'Answered' ? `Answered: ${block.selectedAnswer}` : 'Answered'}
      </div>
    )
  }

  const answers = items.map((item, i) => {
    const key = picked[i]
    const option = item.options.find((o) => o.key === key)
    if (option?.isCustomInput) return (custom[i] || '').trim()
    return option?.label ?? ''
  })
  const complete = answers.every((a) => a)

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
    <div className="ask" role="group" aria-label="Question from the agent">
      <div className="ask-h">
        <Hand size={16} aria-hidden="true" /> Needs your answer
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="ask-title">{item.question}</div>
          {item.options.map((o) =>
            o.isCustomInput ? (
              <div key={o.key} className="opt" aria-pressed={picked[i] === o.key} onClick={() => setPicked((p) => ({ ...p, [i]: o.key }))}>
                <input
                  value={custom[i] || ''}
                  onFocus={() => setPicked((p) => ({ ...p, [i]: o.key }))}
                  onChange={(e) => setCustom((c) => ({ ...c, [i]: e.target.value }))}
                  placeholder="Type your own answer"
                  aria-label="Your own answer"
                  style={{ width: '100%', fontSize: 16 }}
                />
              </div>
            ) : (
              <button
                key={o.key}
                className="opt"
                aria-pressed={picked[i] === o.key}
                onClick={() => setPicked((p) => ({ ...p, [i]: o.key }))}
              >
                {o.label}
              </button>
            ),
          )}
        </div>
      ))}
      <div className="ask-actions">
        <button className="btn" onClick={() => void submit(true)}>
          Skip
        </button>
        <button className="btn call grow" disabled={!complete} onClick={() => void submit()}>
          Send answer
        </button>
      </div>
      {error && <div className="say error">{error}</div>}
    </div>
  )
}
