import React, { useEffect, useState } from 'react'
import { Check, RefreshCw, X } from 'lucide-react'
import Sheet from './Sheet'
import { loadProviders, useStore } from '../store'
import { defaultOptions } from '../format'
import { providerIcon } from './providerIcons'
import type { ModelChoice } from '../types'

interface ModelSheetProps {
  value?: ModelChoice
  title?: string
  onChange: (choice: ModelChoice) => void
  onClose: () => void
}

/**
 * Pixel-perfect model selector matching PC orchestrator's liquid-glass design.
 */
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

  const headerActions = (
    <div className="model-picker-header-actions">
      <button
        type="button"
        className="model-picker-icon-btn"
        onClick={() => void refresh()}
        disabled={refreshing || providersLoading}
        title="Refresh models"
        aria-label="Refresh models"
      >
        <RefreshCw size={15} className={refreshing || providersLoading ? 'spin' : undefined} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="model-picker-icon-btn"
        onClick={onClose}
        title="Close"
        aria-label="Close"
      >
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  )

  return (
    <Sheet
      title={title}
      className="model-picker-sheet"
      headerAction={headerActions}
      onClose={onClose}
      footer={
        <button type="button" className="model-picker-done-btn" onClick={onClose}>
          Done
        </button>
      }
    >
      {providers.length === 0 ? (
        !providersLoaded || providersLoading || refreshing ? (
          <div className="empty" style={{ padding: '28px 16px', textAlign: 'center' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', opacity: 0.7 }} />
            <strong>Checking for agent CLIs…</strong>
            <div className="sub" style={{ marginTop: 6, fontSize: 13, color: 'rgba(255, 255, 255, 0.45)' }}>
              Detecting Antigravity, Claude Code, Codex or OpenCode on your PC
            </div>
          </div>
        ) : (
          <div className="empty" style={{ padding: '20px 8px', textAlign: 'center' }}>
            <strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>No agent CLIs found</strong>
            <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Install Claude Code, Codex, Antigravity or OpenCode on your PC, then tap retry below.
            </p>
            <button
              type="button"
              className="model-picker-done-btn"
              onClick={() => void refresh()}
              disabled={refreshing || providersLoading}
            >
              <RefreshCw size={15} className={refreshing || providersLoading ? 'spin' : undefined} style={{ marginRight: 8 }} />
              {refreshing || providersLoading ? 'Checking your PC…' : 'Retry detection'}
            </button>
          </div>
        )
      ) : (
        <>
          {/* CLI Provider Switcher Bar with Brand Icons */}
          {providers.length > 1 && (
            <div className="model-picker-provider-bar" role="group" aria-label="Provider">
              {providers.map((p) => {
                const isActive = p.driver === driver
                const iconSrc = providerIcon(p.driver)

                return (
                  <button
                    key={p.driver}
                    type="button"
                    className={`model-picker-provider-tab ${isActive ? 'is-active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => setDriver(p.driver)}
                  >
                    {iconSrc && (
                      <img
                        src={iconSrc}
                        alt=""
                        className="model-picker-provider-icon"
                        draggable={false}
                      />
                    )}
                    <span className="model-picker-provider-name">{p.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Model List Section */}
          <div className="model-picker-section">
            <span className="model-picker-section-label">Model</span>
            <div className="model-picker-list" role="listbox" aria-label="Model">
              {(provider?.models ?? []).length === 0 ? (
                <button
                  type="button"
                  className={`model-picker-row ${!current?.model ? 'is-selected' : ''}`}
                  role="option"
                  aria-pressed={!current?.model}
                  aria-selected={!current?.model}
                  onClick={() => onChange({ driver, model: '', options: {} })}
                >
                  {providerIcon(driver) && (
                    <img
                      src={providerIcon(driver)}
                      alt=""
                      className="model-picker-row-icon"
                      draggable={false}
                    />
                  )}
                  <span className="model-picker-row-title">CLI default</span>
                  {!current?.model && <Check size={16} className="model-picker-check" aria-hidden="true" />}
                </button>
              ) : (
                provider?.models.map((m) => {
                  const isSelected = current?.model === m.id
                  const iconSrc = providerIcon(driver)

                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`model-picker-row ${isSelected ? 'is-selected' : ''}`}
                      role="option"
                      aria-pressed={isSelected}
                      aria-selected={isSelected}
                      onClick={() => pickModel(m.id)}
                    >
                      {iconSrc && (
                        <img
                          src={iconSrc}
                          alt=""
                          className="model-picker-row-icon"
                          draggable={false}
                        />
                      )}
                      <span className="model-picker-row-title">{m.name}</span>
                      {isSelected && <Check size={16} className="model-picker-check" aria-hidden="true" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Options / Reasoning Controls (Effort & Thinking) */}
          {model?.options && model.options.length > 0 && (
            <div className="model-picker-options-wrapper">
              <div className="model-picker-divider" />
              {model.options.map((o) => {
                const isThinkingOption =
                  o.id.toLowerCase().includes('thinking') ||
                  o.label.toLowerCase().includes('thinking')

                if (o.type === 'boolean') {
                  const isChecked = Boolean(current?.options?.[o.id])

                  return (
                    <div key={o.id} className="model-picker-section">
                      <span className="model-picker-section-label">{o.label}</span>
                      <div className="model-picker-seg" role="group" aria-label={o.label}>
                        <button
                          type="button"
                          className={`model-picker-seg-btn ${!isChecked ? 'is-selected' : ''}`}
                          aria-pressed={!isChecked}
                          onClick={() => setOption(o.id, false)}
                        >
                          {isThinkingOption ? 'Normal' : 'Off'}
                        </button>
                        <button
                          type="button"
                          className={`model-picker-seg-btn ${isChecked ? 'is-selected' : ''}`}
                          aria-pressed={isChecked}
                          onClick={() => setOption(o.id, true)}
                        >
                          {isThinkingOption ? 'Thinking' : 'On'}
                        </button>
                      </div>
                    </div>
                  )
                }

                // Select choices (e.g. Reasoning Effort: Low, Medium, High, Ultra)
                return (
                  <div key={o.id} className="model-picker-section">
                    <span className="model-picker-section-label">{o.label}</span>
                    <div
                      className={`model-picker-grid ${(o.choices?.length ?? 0) <= 4 ? 'grid-4' : 'grid-2'}`}
                      role="group"
                      aria-label={o.label}
                    >
                      {o.choices?.map((c) => {
                        const isSelected = (current?.options?.[o.id] ?? '') === c.id

                        return (
                          <button
                            key={c.id || 'default'}
                            type="button"
                            className={`model-picker-choice-btn ${isSelected ? 'is-selected' : ''}`}
                            aria-pressed={isSelected}
                            onClick={() => setOption(o.id, c.id)}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
