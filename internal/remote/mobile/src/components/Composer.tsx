import React, { useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Clock3, Paperclip, Square, X } from 'lucide-react'
import { api } from '../api'
import { choiceLabel } from '../format'
import { effectiveChoice, interrupt, removeQueued, send, setChoice, useStore } from '../store'
import ModelSheet from './ModelSheet'
import type { FileRef } from '../types'

interface Attachment {
  ref: FileRef
  preview: string
}

/** Downscales a photo so uploads stay small over a phone connection. */
async function shrink(file: File): Promise<{ data: string; mime: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { data: canvas.toDataURL('image/jpeg', 0.85), mime: 'image/jpeg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function Composer({ threadId, placeholder }: { threadId: string; placeholder: string }) {
  const thread = useStore((s) => s.threads[threadId])
  const providers = useStore((s) => s.providers)
  useStore((s) => s.choices[threadId])
  useStore((s) => s.summaries)
  const choice = effectiveChoice(threadId)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)

  const busy = Boolean(thread?.busy)
  const waiting = thread?.blocks.some(
    (b) => (b.type === 'approval_request' && b.status === 'pending') || (b.type === 'tool_question' && !b.answered),
  )
  const canSend = (text.trim().length > 0 || files.length > 0) && !uploading

  const grow = () => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const submit = () => {
    if (!canSend) return
    void send(threadId, text, files.map((f) => f.ref))
    setText('')
    setFiles([])
    requestAnimationFrame(grow)
  }

  const attach = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(list).slice(0, 4)) {
        const { data, mime } = await shrink(file)
        const ref = await api.upload(file.name || 'photo.jpg', mime, data)
        setFiles((f) => [...f, { ref, preview: data }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (filePicker.current) filePicker.current.value = ''
    }
  }

  return (
    <div className="composer">
      {waiting && (
        <div className="hint" role="status">
          <Clock3 size={14} aria-hidden="true" /> The agent is waiting for your answer above
        </div>
      )}
      {thread && thread.queued.length > 0 && (
        <div className="queued" aria-label="Queued messages">
          {thread.queued.map((q) => (
            <div className="queued-chip" key={q.id}>
              <Clock3 size={13} aria-hidden="true" />
              <span>{q.text}</span>
              <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => removeQueued(threadId, q.id)} aria-label="Remove queued message">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="attachments">
          {files.map((f, i) => (
            <div className="thumb" key={f.ref.path}>
              <img src={f.preview} alt="Attached photo" />
              <button onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} aria-label="Remove photo">
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="hint" style={{ color: 'var(--fault)' }}>{error}</div>}
      <div className="field">
        <button className="icon-btn" onClick={() => filePicker.current?.click()} aria-label="Attach a photo" disabled={uploading}>
          <Paperclip size={20} className={uploading ? 'spin' : undefined} aria-hidden="true" />
        </button>
        <input ref={filePicker} type="file" accept="image/*" multiple hidden onChange={(e) => void attach(e.target.files)} />
        <textarea
          ref={input}
          rows={1}
          value={text}
          placeholder={busy ? 'Queue a message' : placeholder}
          aria-label="Message"
          onChange={(e) => {
            setText(e.target.value)
            grow()
          }}
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {busy && !canSend ? (
          <button className="send stop" onClick={() => void interrupt(threadId)} aria-label="Stop the agent">
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={!canSend} aria-label={busy ? 'Queue message' : 'Send'}>
            <ArrowUp size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="composer-meta">
        <button className="model-pill" onClick={() => setPicking(true)} aria-label={`Model: ${choiceLabel(choice, providers)}. Change`}>
          <span>{choiceLabel(choice, providers)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {picking && (
        <ModelSheet
          value={choice}
          onChange={(c) => setChoice(threadId, c)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
