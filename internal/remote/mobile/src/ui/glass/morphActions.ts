import { morphGroup, type MorphAction } from './morphGroup'

export type { MorphAction } from './morphGroup'

export interface MorphActionsOptions {
  icon: string
  label: string
  actions: MorphAction[]
  tone?: 'danger'
  size?: number
  gap?: number
  inset?: number
  anchor?: 'start' | 'center' | 'end'
  onOpenChange?: (open: boolean) => void
  onFrame?: (ms: number) => void
}

export interface MorphActionsHandle {
  open(): void
  close(focusTrigger?: boolean): void
  setTimeScale(scale: number): void
  isOpen(): boolean
  destroy(): void
}

export function morphActions(host: HTMLElement, options: MorphActionsOptions): MorphActionsHandle {
  const group = morphGroup(host, {
    triggers: [{ id: 'main', label: options.label, icon: options.icon, tone: options.tone, actions: options.actions }],
    size: options.size,
    gap: options.gap,
    inset: options.inset,
    anchor: options.anchor,
    onOpenChange: (id) => options.onOpenChange?.(id !== null),
    onFrame: options.onFrame,
  })
  return {
    open: () => group.open('main'),
    close: group.close,
    setTimeScale: group.setTimeScale,
    isOpen: () => group.openId() !== null,
    destroy: group.destroy,
  }
}
