import { Globe } from '../icons'
import { SheetRow } from './sheet'
import type { DevServer } from '../types'

export default function SiteCard({ server, onOpen }: { server: DevServer; onOpen: (server: DevServer) => void }) {
  return <SheetRow icon={Globe} label={server.name || 'Dev server'} detail={`:${server.port}`} chevron onClick={() => onOpen(server)} />
}
