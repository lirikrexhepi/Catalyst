import { useCallback, useEffect, useRef, useState } from 'react'
import { MorphSurface, prefersReducedMotion } from '../../ui'
import { useElementSize } from '../../ui/geometry/useElementSize'
import { loadProviders, useStore } from '../../store'
import { defaultOptions } from '../../format'
import type { ModelChoice } from '../../types'
import { AccountRow, accountName } from './AccountRow'
import { effortOption, selectedEffort, toggleOptions } from './effort'
import { EffortGrid } from './EffortGrid'
import { PICKER, effortHeight, listHeight } from './layout'
import { ModelList } from './ModelList'
import { MORPH_CLOSE, MORPH_OPEN, useFade, usePaneSwap } from './motion'
import { ProviderBar } from './ProviderBar'
import { SelectedModelBar } from './SelectedModelBar'

interface ModelPickerProps {
  value?: ModelChoice
  usage?: number
  onChange: (choice: ModelChoice) => void
  onClose: () => void
}

const COMMIT_DELAY = 140

export function ModelPicker({ value, usage = 0, onChange, onClose }: ModelPickerProps) {
  const providers = useStore((s) => s.providers)
  const providersLoaded = useStore((s) => s.providersLoaded)
  const providersLoading = useStore((s) => s.providersLoading)
  const [driver, setDriver] = useState(value?.driver || providers[0]?.driver || '')
  const [view, setView] = useState<'list' | 'effort'>('list')
  const [pendingAccounts, setPendingAccounts] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<'enter' | 'open' | 'exit'>(() => (prefersReducedMotion() ? 'open' : 'enter'))
  const root = useRef<HTMLDivElement | null>(null)
  const listPane = useRef<HTMLDivElement | null>(null)
  const effortPane = useRef<HTMLDivElement | null>(null)
  const closing = useRef(false)
  const size = useElementSize(root)
  const fadeOut = useFade(root)
  usePaneSwap(listPane, effortPane, view === 'effort')

  useEffect(() => {
    setPhase((p) => (p === 'enter' ? 'open' : p))
  }, [])

  useEffect(() => {
    void loadProviders()
    const focused = document.activeElement
    if (focused instanceof HTMLElement) focused.blur()
  }, [])

  useEffect(() => {
    if (!driver && providers[0]) setDriver(providers[0].driver)
  }, [driver, providers])

  const shownDriver = useRef(driver)
  useEffect(() => {
    if (shownDriver.current === driver) return
    shownDriver.current = driver
    listPane.current?.querySelector('.picker-list')?.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [driver])

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    root.current?.classList.add('closing')
    if (!prefersReducedMotion()) setPhase('exit')
    window.setTimeout(onClose, fadeOut())
  }, [fadeOut, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (view === 'effort') setView('list')
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, view])

  const provider = providers.find((p) => p.driver === driver)
  const status = providers.length > 0 ? 'ready' : !providersLoaded || providersLoading ? 'checking' : 'none'
  const chosenProvider = providers.find((p) => p.driver === value?.driver)
  const chosenModel = chosenProvider?.models.find((m) => m.id === value?.model)
  const effort = effortOption(chosenModel)
  const choices = effort?.choices ?? []
  const toggles = toggleOptions(chosenModel, value)
  const tunable = choices.length > 0 || toggles.length > 0

  const accounts = provider?.accounts ?? []
  const showAccounts = status === 'ready' && accounts.length > 1
  const shownAccount = value?.driver === driver ? (value.account ?? '') : (pendingAccounts[driver] ?? '')

  const listRows = status === 'ready' ? Math.max(provider?.models.length ?? 1, 1) : 3
  const hList = Math.min(PICKER.frame, listHeight(listRows) + (showAccounts ? PICKER.accounts : 0))
  const hEffort = tunable ? effortHeight(choices.length, toggles.length) : effortHeight(4)
  const hMax = PICKER.frame

  const pickModel = (id: string) => {
    if (!provider) return
    const model = provider.models.find((m) => m.id === id)
    const already = value?.driver === provider.driver && value?.model === id
    if (already) {
      if (effortOption(model) || toggleOptions(model).length > 0) setView('effort')
      return
    }
    const account = value?.driver === provider.driver ? value.account : pendingAccounts[provider.driver]
    onChange({ driver: provider.driver, account: account || undefined, model: id, options: defaultOptions(model?.options) })
  }

  const pickAccount = (account: string) => {
    if (value && value.driver === driver) {
      onChange({ ...value, account: account || undefined })
      return
    }
    setPendingAccounts((previous) => ({ ...previous, [driver]: account }))
  }

  const pickEffort = (id: string) => {
    if (!value) return
    onChange({ ...value, options: { ...(value.options ?? {}), effort: id } })
    if (toggles.length === 0) window.setTimeout(close, COMMIT_DELAY)
  }

  const flip = (id: string) => {
    if (!value) return
    const toggle = toggles.find((t) => t.id === id)
    onChange({ ...value, options: { ...(value.options ?? {}), [id]: !toggle?.on } })
  }

  return (
    <>
      <div className="picker-catcher" onPointerDown={close} aria-hidden />
      <div className="model-picker" ref={root} role="dialog" aria-modal="true" aria-label="Choose a model" style={{ height: hMax }}>
        <MorphSurface
          width={size?.width ?? 345}
          height={phase === 'open' ? (view === 'list' ? hList : hEffort) : 0}
          maxHeight={hMax}
          radius={PICKER.radius}
          fill={PICKER.fill}
          spring={phase === 'exit' ? MORPH_CLOSE : MORPH_OPEN}
        >
        <div ref={listPane} className="picker-pane" data-active={view === 'list'} aria-hidden={view !== 'list'} style={{ height: hList }}>
          <ModelList provider={provider} value={value} status={status} onPick={pickModel} onRetry={() => void loadProviders(true)} />
          {showAccounts ? <AccountRow accounts={accounts} selected={shownAccount} onPick={pickAccount} /> : null}
          {status === 'ready' ? <ProviderBar providers={providers} active={driver} onPick={setDriver} /> : null}
        </div>
        <div ref={effortPane} className="picker-pane" data-active={view === 'effort'} aria-hidden={view !== 'effort'} style={{ height: hEffort }}>
          {value && chosenModel && tunable ? (
            <>
              <EffortGrid choices={choices} selected={selectedEffort(effort, value)?.id} toggles={toggles} onPick={pickEffort} onToggle={flip} />
              <SelectedModelBar
                driver={value.driver}
                providerName={chosenProvider?.name}
                modelName={[chosenModel.name, accountName(chosenProvider?.accounts, value.account)].filter(Boolean).join(' · ')}
                usage={usage}
                onBack={() => setView('list')}
              />
            </>
          ) : null}
        </div>
        </MorphSurface>
      </div>
    </>
  )
}
