import { useEffect, useRef, useState } from 'react'
import { Folder, ShieldCheck, Workflow } from 'lucide-react'
import Sheet from '../../components/Sheet'
import ModelSheet from '../../components/ModelSheet'
import { ChatFrame } from '../../components/chrome/ChatFrame'
import { TopBar } from '../../components/chrome/TopBar'
import { ModelSwitch } from '../../components/chrome/ModelSwitch'
import { Composer } from '../../components/composer/Composer'
import { providerIcon } from '../../components/providerIcons'
import { api } from '../../api'
import { choiceLabel, defaultOptions } from '../../format'
import { loadProviders, message, refreshSummaries, useStore } from '../../store'
import type { ModelChoice, Project } from '../../types'
import { usePreviewFlow } from './usePreviewFlow'

interface NewChatProps {
  openDrawer: () => void
  go: (id: string | null) => void
}

const LAST_KEY = 'orchestrator_new_agent'

function lastUsed(): { cwd?: string; choice?: ModelChoice; autoApprove?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function remember(value: { cwd: string; choice: ModelChoice; autoApprove: boolean }) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(value))
  } catch {
    return
  }
}

export function NewChat({ openDrawer, go }: NewChatProps) {
  const providers = useStore((s) => s.providers)
  const providersLoaded = useStore((s) => s.providersLoaded)
  const providersLoading = useStore((s) => s.providersLoading)
  const remembered = useRef(lastUsed()).current
  const [projects, setProjects] = useState<Project[]>([])
  const [cwd, setCwd] = useState(remembered.cwd || '')
  const [choice, setLocalChoice] = useState<ModelChoice | undefined>(remembered.choice)
  const [autoApprove, setAutoApprove] = useState(remembered.autoApprove ?? true)
  const [sheet, setSheet] = useState<'model' | 'project' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = usePreviewFlow(null, false)

  useEffect(() => {
    void loadProviders()
    api
      .projects()
      .then((list) => {
        const all = Array.isArray(list) ? list : []
        setProjects(all)
        setCwd((cur) => (cur && all.some((p) => p.path === cur) ? cur : all[0]?.path || cur))
      })
      .catch((e) => setError(message(e)))
  }, [])

  useEffect(() => {
    if (providers.length === 0) return
    const p = providers.find((x) => x.driver === choice?.driver)
    if (p && (choice?.model === '' ? p.models.length === 0 : p.models.some((m) => m.id === choice?.model))) return
    const first = providers[0]
    const m = first.models.find((x) => x.default) ?? first.models[0]
    if (m) setLocalChoice({ driver: first.driver, model: m.id, options: defaultOptions(m.options) })
    else setLocalChoice({ driver: first.driver, model: '', options: {} })
  }, [choice, providers])

  const project = projects.find((p) => p.path === cwd)
  const checking = !providersLoaded || providersLoading
  const label = providers.length === 0 ? (checking ? 'Checking CLIs…' : 'No agent CLIs') : choiceLabel(choice, providers)

  const create = async (prompt: string): Promise<boolean> => {
    if (!choice?.driver) {
      setError(checking ? 'Detecting agent CLIs on your PC, please wait a moment...' : 'No agent CLI is available on your PC. Check Settings on the desktop.')
      return false
    }
    if (!cwd) {
      setError('Pick a project first.')
      return false
    }
    setError(null)
    try {
      const { threadId } = await api.newAgent({ prompt, cwd, choice, autoApprove })
      remember({ cwd, choice, autoApprove })
      void refreshSummaries()
      go(threadId)
      return true
    } catch (e) {
      setError(message(e))
      return false
    }
  }

  const header = (
    <TopBar
      onMenu={openDrawer}
      onNew={() => go(null)}
      onPreview={preview.open}
      model={<ModelSwitch label={label} icon={choice?.driver ? providerIcon(choice.driver) : undefined} onClick={() => setSheet('model')} />}
    />
  )

  return (
    <div className="screen">
      <ChatFrame header={header} dock={<Composer placeholder="Enter your text here...." onCreate={create} />}>
        <div className="starters">
          {error ? <div className="say error" style={{ margin: '0 12px 8px' }}>{error}</div> : null}
          <button className="starter" onClick={() => setSheet('project')}>
            <Folder size={21} aria-hidden />
            <span className="grow">Project</span>
            <span className="val">{project?.name || (projects.length ? 'Choose' : 'None')}</span>
          </button>
          <div className="starter" role="group">
            <ShieldCheck size={21} aria-hidden />
            <span className="grow">Run without asking</span>
            <button className="switch" role="switch" aria-checked={autoApprove} aria-label="Run without asking" onClick={() => setAutoApprove((v) => !v)} />
          </div>
          <button className="starter" onClick={() => go('coordinator')}>
            <Workflow size={21} aria-hidden />
            <span className="grow">Plan with the orchestrator</span>
          </button>
        </div>
      </ChatFrame>

      {sheet === 'model' ? <ModelSheet value={choice} onChange={setLocalChoice} onClose={() => setSheet(null)} /> : null}
      {sheet === 'project' ? (
        <Sheet title="Project" onClose={() => setSheet(null)}>
          <div className="list">
            {projects.map((p) => (
              <button
                key={p.path}
                aria-pressed={p.path === cwd}
                onClick={() => {
                  setCwd(p.path)
                  setSheet(null)
                }}
              >
                <Folder size={18} aria-hidden />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {p.name}
                  <span className="sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.path}
                  </span>
                </span>
              </button>
            ))}
            {projects.length === 0 ? <div className="empty">No projects yet. Add one on the desktop.</div> : null}
          </div>
        </Sheet>
      ) : null}
      {preview.element}
    </div>
  )
}
