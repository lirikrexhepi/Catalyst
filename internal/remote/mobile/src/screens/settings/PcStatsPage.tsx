import { useCallback, useEffect, useState } from 'react'
import { Activity, Clock, Cpu, HardDrive, RefreshCw, Zap } from 'lucide-react'
import { SheetList, SheetNote, SheetRow } from '../../components/sheet'
import { api, type PCStats } from '../../api'
import { Section, SubPage } from './SubPage'
import { useStore } from '../../store'

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  return `${gb.toFixed(1)} GB`
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ${minutes % 60}m`
}

export function PcStatsPage({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<PCStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const connection = useStore((s) => s.connection)

  const load = useCallback(() => {
    api
      .pcStats()
      .then((s) => {
        setStats(s)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach PC'))
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 1500)
    return () => window.clearInterval(id)
  }, [load])

  const manualRefresh = () => {
    setRefreshing(true)
    api
      .pcStats()
      .then((s) => {
        setStats(s)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not reach PC'))
      .finally(() => window.setTimeout(() => setRefreshing(false), 400))
  }

  const cpuPct = stats ? Math.min(100, Math.max(0, Math.round(stats.cpuPercent))) : 0
  const ramPct = stats ? Math.min(100, Math.max(0, Math.round(stats.memoryPercent))) : 0

  return (
    <SubPage title="PC Performance" onClose={onClose}>
      <Section title="Processor (CPU)">
        <SheetList>
          <SheetRow
            icon={Cpu}
            label="CPU Utilization"
            detail={stats ? `${stats.cpuPercent.toFixed(1)}%` : '—'}
          />
          <div style={{ padding: '0 16px 14px 16px' }}>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${cpuPct}%`,
                  borderRadius: 4,
                  background: cpuPct > 85 ? 'var(--danger, #ff453a)' : cpuPct > 60 ? 'var(--warn, #ffd60a)' : 'var(--accent, #0a84ff)',
                  transition: 'width 0.5s ease-out',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, opacity: 0.6 }}>
              <span>{stats ? `${stats.cpuCores} Logical Cores` : 'Cores'}</span>
              <span>{stats ? `${cpuPct}% used` : ''}</span>
            </div>
          </div>
        </SheetList>
      </Section>

      <Section title="Memory (RAM)">
        <SheetList>
          <SheetRow
            icon={HardDrive}
            label="Memory Usage"
            detail={stats ? `${formatBytes(stats.memoryUsedBytes)} / ${formatBytes(stats.memoryTotalBytes)}` : '—'}
          />
          <div style={{ padding: '0 16px 14px 16px' }}>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${ramPct}%`,
                  borderRadius: 4,
                  background: ramPct > 90 ? 'var(--danger, #ff453a)' : ramPct > 75 ? 'var(--warn, #ffd60a)' : 'var(--accent, #0a84ff)',
                  transition: 'width 0.5s ease-out',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, opacity: 0.6 }}>
              <span>{stats ? `${formatBytes(stats.memoryTotalBytes - stats.memoryUsedBytes)} Available` : 'Available'}</span>
              <span>{stats ? `${ramPct}% used` : ''}</span>
            </div>
          </div>
        </SheetList>
      </Section>

      <Section title="System Overview">
        <SheetList>
          <SheetRow
            icon={Clock}
            label="System Uptime"
            detail={stats ? formatUptime(stats.uptimeSeconds) : '—'}
          />
          <SheetRow
            icon={Zap}
            label="Live Connection"
            detail={connection === 'live' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : 'Offline'}
          />
          <SheetRow
            icon={RefreshCw}
            label="Refresh Stats"
            chevron
            disabled={refreshing}
            onClick={manualRefresh}
          />
        </SheetList>
      </Section>

      {error ? (
        <SheetNote tone="error">Status check failed: {error}</SheetNote>
      ) : (
        <SheetNote>Metrics update live every 1.5 seconds from Windows Task Manager telemetry.</SheetNote>
      )}
    </SubPage>
  )
}
