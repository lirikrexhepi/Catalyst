import { useCallback, useEffect, useRef, useState } from 'react'
import { ModelPicker } from '../../components/modelPicker/ModelPicker'
import { ChatFrame } from '../../components/chrome/ChatFrame'
import { TopBar } from '../../components/chrome/TopBar'
import { ModelSwitch } from '../../components/chrome/ModelSwitch'
import { Composer } from '../../components/composer/Composer'
import { providerIcon } from '../../components/providerIcons'
import { api } from '../../api'
import { choiceModelName, defaultOptions } from '../../format'
import { failure, isUnreachable, loadProviders, refreshSummaries, useStore } from '../../store'
import type { ModelChoice, Project } from '../../types'
import { HistoryScrubber } from '../../components/scrubber/HistoryScrubber'
import { StartOptions } from './StartOptions'
import { usePreviewFlow } from './usePreviewFlow'
import { PROJECTS_CACHE_KEY, readLocal, writeLocal } from '../../cache'
import { ProjectSheet } from './ProjectSheet'
import { StatusCard } from '../../components/status/StatusCard'
import AddProjectSheet from '../AddProjectSheet'

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
  const summaries = useStore((s) => s.summaries)
  const providersLoaded = useStore((s) => s.providersLoaded)
  const providersLoading = useStore((s) => s.providersLoading)
  const remembered = useRef(lastUsed()).current
  const [projects, setProjects] = useState<Project[]>(() => readLocal<Project[]>(PROJECTS_CACHE_KEY, []))
  const [cwd, setCwd] = useState(() => remembered.cwd || projects[0]?.path || '')
  const [choice, setLocalChoice] = useState<ModelChoice | undefined>(remembered.choice)
  const [autoApprove, setAutoApprove] = useState(remembered.autoApprove ?? true)
  const [sheet, setSheet] = useState<'model' | 'project' | 'add' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const preview = usePreviewFlow(null, cwd || undefined)

  const loadProjects = useCallback((select?: string) => {
    api
      .projects()
      .then((list) => {
        const all = Array.isArray(list) ? list : []
        writeLocal(PROJECTS_CACHE_KEY, all)
        setProjects(all)
        setCwd((cur) => (select && all.some((p) => p.path === select) ? select : cur && all.some((p) => p.path === cur) ? cur : all[0]?.path || cur))
      })
      .catch((e) => setError(failure(e)))
  }, [])

  useEffect(() => {
    void loadProviders()
    loadProjects()
  }, [loadProjects])

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
  const label = providers.length === 0 ? (checking ? 'Checking CLIs…' : 'No agent CLIs') : choiceModelName(choice, providers)

  const create = async (prompt: string, files: import('../../types').FileRef[] = []): Promise<boolean> => {
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
      const { threadId } = await api.newAgent({ prompt, cwd, choice, autoApprove, files })
      remember({ cwd, choice, autoApprove })
      void refreshSummaries()
      go(threadId)
      return true
    } catch (e) {
      setError(failure(e))
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
      <ChatFrame header={header} dock={<Composer placeholder="Enter your text here...." onCreate={create} />} floating={<HistoryScrubber chats={summaries} onPick={go} />}>
        {error && !isUnreachable(error) ? <StatusCard className="start-error">{error}</StatusCard> : null}
        <StartOptions
          projectName={project?.name ?? (projects.length ? undefined : 'None')}
          projectId={project?.id}
          onProject={() => setSheet('project')}
          autoApprove={autoApprove}
          onAutoApprove={setAutoApprove}
        />
      </ChatFrame>

      {sheet === 'model' ? <ModelPicker value={choice} onChange={setLocalChoice} onClose={() => setSheet(null)} /> : null}
      {sheet === 'project' ? (
        <ProjectSheet projects={projects} value={cwd} onPick={setCwd} onAdd={() => setSheet('add')} onClose={() => setSheet((s) => (s === 'project' ? null : s))} />
      ) : null}
      {sheet === 'add' ? (
        <AddProjectSheet onClose={() => setSheet((s) => (s === 'add' ? null : s))} onAdded={(p) => loadProjects(p.path)} />
      ) : null}
      {preview.element}
    </div>
  )
}
