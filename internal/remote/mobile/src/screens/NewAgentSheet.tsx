import React, { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Sheet from '../components/Sheet'
import ModelSheet from '../components/ModelSheet'
import { api } from '../api'
import { choiceLabel, defaultOptions } from '../format'
import { loadProviders, message, refreshSummaries, useStore } from '../store'
import type { ModelChoice, Project } from '../types'

const LAST_KEY = 'orchestrator_new_agent'

function lastUsed(): { cwd?: string; choice?: ModelChoice; autoApprove?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

/** Start an agent on a project with a chosen model and effort. */
export default function NewAgentSheet({ onClose, onStarted }: { onClose: () => void; onStarted: (threadId: string) => void }) {
  const providers = useStore((s) => s.providers)
  const remembered = lastUsed()
  const [projects, setProjects] = useState<Project[]>([])
  const [cwd, setCwd] = useState(remembered.cwd || '')
  const [prompt, setPrompt] = useState('')
  const [choice, setChoice] = useState<ModelChoice | undefined>(remembered.choice)
  const [autoApprove, setAutoApprove] = useState(remembered.autoApprove ?? true)
  const [picking, setPicking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadProviders()
    api
      .projects()
      .then((list) => {
        const all = Array.isArray(list) ? list : []
        setProjects(all)
        if (!cwd && all[0]) setCwd(all[0].path)
      })
      .catch((e) => setError(message(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (choice || providers.length === 0) return
    const p = providers[0]
    const m = p.models.find((x) => x.default) ?? p.models[0]
    if (m) setChoice({ driver: p.driver, model: m.id, options: defaultOptions(m.options) })
    else setChoice({ driver: p.driver, model: '', options: {} })
  }, [choice, providers])

  const ready = prompt.trim() && cwd && choice?.driver && !starting

  const start = async () => {
    if (!ready || !choice) return
    setStarting(true)
    setError(null)
    try {
      const { threadId } = await api.newAgent({ prompt: prompt.trim(), cwd, choice, autoApprove })
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ cwd, choice, autoApprove }))
      } catch {
        /* private mode */
      }
      void refreshSummaries()
      onStarted(threadId)
    } catch (e) {
      setError(message(e))
      setStarting(false)
    }
  }

  return (
    <Sheet
      title="New agent"
      onClose={onClose}
      footer={
        <button className="btn primary grow" disabled={!ready} onClick={() => void start()}>
          {starting ? 'Starting agent' : 'Start agent'}
        </button>
      }
    >
      <div>
        <label className="label" htmlFor="new-prompt">
          What should it do?
        </label>
        <div className="textarea-box">
          <textarea
            id="new-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Fix the flaky login test and explain the cause"
            autoFocus
          />
        </div>
      </div>

      <div>
        <span className="label">Project</span>
        {projects.length === 0 ? (
          <div className="when">Add a project folder on your PC first.</div>
        ) : (
          <div className="list" role="listbox" aria-label="Project">
            {projects.map((p) => (
              <button key={p.path} role="option" aria-selected={p.path === cwd} aria-pressed={p.path === cwd} onClick={() => setCwd(p.path)}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {p.name}
                  <div className="sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</div>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="label">Model</span>
        <button className="model-pill" onClick={() => setPicking(true)} style={{ minHeight: 44, fontSize: 15 }}>
          <span>{choiceLabel(choice, providers)}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="toggle-row">
        <span className="txt">
          Run without asking
          <small>{autoApprove ? 'Edits and commands run right away' : 'You approve edits and commands from here'}</small>
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={autoApprove}
          aria-label="Run without asking"
          onClick={() => setAutoApprove((v) => !v)}
        />
      </div>

      {error && <div className="say error">{error}</div>}

      {picking && <ModelSheet value={choice} title="Model for this agent" onChange={setChoice} onClose={() => setPicking(false)} />}
    </Sheet>
  )
}
