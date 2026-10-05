import { Eye, RefreshCw, SlidersHorizontal } from '../icons'
import { showAllChats, useHiddenChats } from '../hiddenChats'
import { Sheet, SheetList, SheetRow } from '../components/sheet'
import { loadProviders, refreshSummaries } from '../store'
import { NotificationSettings } from './settings/NotificationSettings'

export default function SettingsSheet({ onClose, onOpenAll }: { onClose: () => void; onOpenAll: () => void }) {
  const hidden = useHiddenChats()

  return (
    <Sheet title="Settings" onClose={onClose}>
      {(dismiss) => (
        <>
          <NotificationSettings compact />
          <SheetList>
            <SheetRow
              icon={Eye}
              label="Hidden chats"
              detail={hidden.size ? `Show ${hidden.size}` : 'None'}
              disabled={hidden.size === 0}
              onClick={showAllChats}
            />
            <SheetRow
              icon={RefreshCw}
              label="Refresh"
              onClick={() =>
                dismiss(() => {
                  void refreshSummaries()
                  void loadProviders(true)
                })
              }
            />
          </SheetList>
          <SheetList>
            <SheetRow icon={SlidersHorizontal} label="All settings" chevron onClick={() => dismiss(onOpenAll)} />
          </SheetList>
        </>
      )}
    </Sheet>
  )
}
