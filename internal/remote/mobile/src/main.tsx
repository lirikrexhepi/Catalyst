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
import { initPhoneLogger } from './phoneLogger'

trackVisualViewport()
installSpringEasing('ease-drawer', SPRINGS.drawer)
initPhoneLogger()

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  let refreshing = false

  function agentBusy(): boolean {
    try {
      const raw = localStorage.getItem('orchestrator_summaries_cache')
      if (!raw) return false
      const list = JSON.parse(raw)
      return Array.isArray(list) && list.some((s) => s && s.busy === true)
    } catch {
      return false
    }
  }

  function reloadWhenIdle() {
    if (refreshing) return
    if (agentBusy()) {
      window.setTimeout(reloadWhenIdle, 5000)
      return
    }
    refreshing = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    if (document.visibilityState !== 'visible') {
      const onVisible = () => {
        if (document.visibilityState !== 'visible') return
        document.removeEventListener('visibilitychange', onVisible)
        reloadWhenIdle()
      }
      document.addEventListener('visibilitychange', onVisible)
      return
    }
    reloadWhenIdle()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.update().catch(() => undefined)
    }).catch(() => undefined)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => undefined)
      })
    }
  })
}
