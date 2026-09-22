import React, { useEffect, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import Sheet from './Sheet'
import { loadProviders, useStore } from '../store'
import { defaultOptions } from '../format'
import type { ModelChoice } from '../types'

interface ModelSheetProps {
  value?: ModelChoice
  title?: string
  onChange: (choice: ModelChoice) => void
  onClose: () => void
}

/** Provider, model and that model's options (effort, thinking…). */
export default function ModelSheet({ value, title = 'Model', onChange, onClose }: ModelSheetProps) {
  const providers = useStore((s) => s.providers)
  const providersLoaded = useStore((s) => s.providersLoaded)
  const providersLoading = useStore((s) => s.providersLoading)
  const [refreshing, setRefreshing] = useState(false)
  const [driver, setDriver] = useState(value?.driver || providers[0]?.driver || '')

  useEffect(() => {
    void loadProviders()
  }, [])
  useEffect(() => {
    if (!driver && providers[0]) setDriver(providers[0].driver)
  }, [driver, providers])

  const provider = providers.find((p) => p.driver === driver)
  const current = value?.driver === driver ? value : undefined
  const model = provider?.models.find((m) => m.id === current?.model)

  const pickModel = (id: string) => {
    const m = provider?.models.find((x) => x.id === id)
    const keep = current?.model === id ? current.options : undefined
    onChange({ driver, model: id, options: keep ?? defaultOptions(m?.options) })
  }

  const setOption = (id: string, v: unknown) => {
    if (!current) return
    onChange({ ...current, options: { ...(current.options ?? {}), [id]: v } })
  }

  const refresh = async () => {
    setRefreshing(true)
    await loadProviders(true)
    setRefreshing(false)
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button className="btn primary grow" onClick={onClose}>
          Done
        </button>
      }
    >
      {providers.length === 0 ? (
        !providersLoaded || providersLoading || refreshing ? (
          <div className="empty" style={{ padding: '24px 16px', textAlign: 'center' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', opacity: 0.7 }} />
            <strong>Checking for agent CLIs…</strong>
            <div className="sub" style={{ marginTop: 6, fontSize: 13 }}>
              Detecting Antigravity, Claude Code, Codex or OpenCode on your PC
            </div>
          </div>
        ) : (
          <div className="empty" style={{ padding: 0 }}>
            <strong>No agent CLIs found</strong>
            Install Claude Code, Codex, Antigravity or OpenCode on your PC, then refresh. If the desktop
            already lists them, tap retry below — the phone reads the same probe.
            <div style={{ marginTop: 14 }}>
              <button className="btn" onClick={() => void refresh()} disabled={refreshing || providersLoading}>
                <RefreshCw size={16} className={refreshing || providersLoading ? 'spin' : undefined} aria-hidden="true" />
                {refreshing || providersLoading ? 'Checking your PC…' : 'Retry detection'}
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          {providers.length > 1 && (
            <div className="seg" role="group" aria-label="Provider">
              {providers.map((p) => (
                <button key={p.driver} aria-pressed={p.driver === driver} onClick={() => setDriver(p.driver)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <div>
            <span className="label">Model</span>
            <div className="list" role="listbox" aria-label="Model">
              {(provider?.models ?? []).length === 0 ? (
                <button
                  role="option"
                  aria-pressed={!current?.model}
                  aria-selected={!current?.model}
                  onClick={() => onChange({ driver, model: '', options: {} })}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    CLI default
                    <div className="sub">Whatever {provider?.name || driver} uses when no model is pinned</div>
                  </span>
                  {!current?.model && <Check size={18} aria-hidden="true" />}
                </button>
              ) : (
                provider?.models.map((m) => (
                  <button
                    key={m.id}
                    role="option"
                    aria-pressed={current?.model === m.id}
                    aria-selected={current?.model === m.id}
                    onClick={() => pickModel(m.id)}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {m.name}
                      {m.name !== m.id && <div className="sub">{m.id}</div>}
                    </span>
                    {current?.model === m.id && <Check size={18} aria-hidden="true" />}
                  </button>
                ))
              )}
            </div>
          </div>

          {model?.options?.map((o) =>
            o.type === 'boolean' ? (
              <div className="toggle-row" key={o.id}>
                <span className="txt">{o.label}</span>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={Boolean(current?.options?.[o.id])}
                  aria-label={o.label}
                  onClick={() => setOption(o.id, !current?.options?.[o.id])}
                />
              </div>
            ) : (
              <div key={o.id}>
                <span className="label">{o.label}</span>
                <div className="seg" role="group" aria-label={o.label}>
                  {o.choices?.map((c) => (
                    <button
                      key={c.id || 'default'}
                      aria-pressed={(current?.options?.[o.id] ?? '') === c.id}
                      onClick={() => setOption(o.id, c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}

          <button className="btn" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'spin' : undefined} aria-hidden="true" />
            {refreshing ? 'Checking your PC' : 'Refresh models'}
          </button>
        </>
      )}
    </Sheet>
  )
}
