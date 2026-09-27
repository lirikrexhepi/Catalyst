import { useState } from 'react'
import type { DevServer } from '../../types'
import { PreviewLauncher, PreviewScreen } from '../Preview'

export function usePreviewFlow(threadId: string | null, cwd?: string) {
  const [state, setState] = useState<'pick' | DevServer | null>(null)
  const element =
    state === 'pick' ? (
      <PreviewLauncher threadId={threadId} cwd={cwd} onClose={() => setState(null)} onOpen={setState} />
    ) : state ? (
      <PreviewScreen port={state.port} name={state.name || 'Dev server'} onBack={() => setState(null)} />
    ) : null
  return { open: () => setState('pick'), element }
}
