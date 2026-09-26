import { StrictMode, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import './seedProviders'
import '@fontsource-variable/geist'
import '../index.css'
import '../styles/tokens.css'
import '../styles/chat.css'
import '../styles/picker.css'
import '../styles/scrubber.css'
import '../styles/drawer.css'
import '../styles/sheet.css'
import '../styles/ask.css'
import Chat from '../screens/Chat'
import Drawer from '../screens/Drawer'
import { PreviewScreen } from '../screens/Preview'
import { trackVisualViewport } from '../platform/viewport'
import Feed from '../feed/Feed'
import type { AgentStreamBlock } from '../feed/types'

const ASK_BLOCKS = [
  {
    type: 'tool_question',
    id: 'question-1',
    question: 'Which database should the importer write to?',
    options: [
      { key: 'a', label: 'Postgres on the dev box' },
      { key: 'b', label: 'SQLite next to the binary' },
      { key: 'c', label: 'Other', isCustomInput: true },
    ],
  },
  {
    type: 'approval_request',
    id: 'approval-1',
    requestID: 'r1',
    title: 'Run npm install in configurator',
    detail: 'npm install --no-audit --no-fund',
    options: [],
    status: 'pending',
  },
] as unknown as AgentStreamBlock[]

trackVisualViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="shell" style={location.hash === '#drawer' ? ({ '--p': 1 } as CSSProperties) : undefined}>
      {location.hash === '#drawer' ? (
        <nav className="drawer">
          <Drawer current="lab-1" project={null} go={() => undefined} openProject={() => undefined} />
        </nav>
      ) : null}
      <main className="main">
        <Chat threadId={location.hash === '#thread' ? 'lab-thread' : null} openDrawer={() => undefined} go={() => undefined} />
        {location.hash === '#ask' ? (
          <div className="chat-frame" style={{ position: 'absolute', inset: 0, padding: 16, overflow: 'auto', background: 'var(--chat-bg)' }}>
            <Feed threadId="lab" blocks={ASK_BLOCKS} turnMs={{}} />
          </div>
        ) : null}
        {location.hash === '#preview' ? <PreviewScreen port={5173} name="Configurator" onBack={() => undefined} /> : null}
      </main>
    </div>
  </StrictMode>,
)
