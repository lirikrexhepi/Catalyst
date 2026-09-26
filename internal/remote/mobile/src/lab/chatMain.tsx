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
import Chat from '../screens/Chat'
import Drawer from '../screens/Drawer'
import { PreviewScreen } from '../screens/Preview'
import { trackVisualViewport } from '../platform/viewport'

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
        {location.hash === '#preview' ? <PreviewScreen port={5173} name="Configurator" onBack={() => undefined} /> : null}
      </main>
    </div>
  </StrictMode>,
)
