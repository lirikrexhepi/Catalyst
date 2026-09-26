import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './seedProviders'
import '../index.css'
import '../styles/tokens.css'
import '../styles/chat.css'
import '../styles/picker.css'
import Chat from '../screens/Chat'
import { trackVisualViewport } from '../platform/viewport'

trackVisualViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="shell">
      <main className="main">
        <Chat threadId={location.hash === '#thread' ? 'lab-thread' : null} openDrawer={() => undefined} go={() => undefined} />
      </main>
    </div>
  </StrictMode>,
)
