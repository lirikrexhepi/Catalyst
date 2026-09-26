import type { ReactNode } from 'react'
import { Menu, MessageCirclePlus, Play } from 'lucide-react'
import { BarButton } from './BarButton'

interface TopBarProps {
  model: ReactNode
  onMenu: () => void
  onNew: () => void
  onPreview?: () => void
  children?: ReactNode
}

export function TopBar({ model, onMenu, onNew, onPreview, children }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-row">
        <BarButton icon={Menu} label="Open chats" onClick={onMenu} />
        {model}
        <div className="topbar-end">
          {onPreview ? <BarButton icon={Play} label="Preview the site" onClick={onPreview} /> : null}
          <BarButton icon={MessageCirclePlus} label="New chat" onClick={onNew} />
        </div>
      </div>
      {children}
    </header>
  )
}
