import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import './index.css'
import './styles/tokens.css'
import { initTheme } from './theme'
import './styles/chat.css'
import './styles/picker.css'
import './styles/scrubber.css'
import './styles/drawer.css'
import './styles/sheet.css'
import './styles/ask.css'
import './styles/settings.css'
import App from './App'
import { trackVisualViewport } from './platform/viewport'
import { installSpringEasing } from './ui/motion/springEasing'
import { SPRINGS } from './ui/motion/spring'

trackVisualViewport()
installSpringEasing('ease-drawer', SPRINGS.drawer)

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
