import { useState } from 'react'
import type { DevServer } from '../../types'
import { PreviewLauncher, PreviewScreen } from '../Preview'

const lastPreview = new Map<string, DevServer>()

export function usePreviewFlow(threadId: string | null, cwd?: string) {
  const [state, setState] = useState<'pick' | DevServer | null>(null)
  const key = threadId || cwd || ''
  const show = (server: DevServer) => {
    lastPreview.set(key, server)
    setState(server)
  }
  const forget = () => lastPreview.delete(key)
  const element =
    state === 'pick' ? (
      <PreviewLauncher threadId={threadId} cwd={cwd} onClose={() => setState(null)} onOpen={show} />
    ) : state ? (
      <PreviewScreen
        port={state.port}
        name={state.name || 'Dev server'}
        onBack={() => setState(null)}
        onGone={() => {
          forget()
          setState('pick')
        }}
        onStopped={() => {
          forget()
          setState(null)
        }}
      />
    ) : null
  return { open: () => setState(lastPreview.get(key) ?? 'pick'), element }
}
