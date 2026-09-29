import React from 'react';
import { domain, session } from '../../../wailsjs/go/models';

export const DRIVER_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  antigravity: 'Antigravity',
  codex: 'Codex',
  opencode: 'OpenCode',
};

export const usageKey = (entry: session.DriverUsage) => `${entry.driver}:${entry.account || 'default'}`;

export const usageName = (entry: session.DriverUsage) => {
  const name = DRIVER_NAMES[entry.driver] ?? entry.driver;
  return entry.accountName ? `${name} · ${entry.accountName}` : name;
};

// Past this the figures are old enough to mislead — the 5h window can move
// several points in that time — so the label is flagged rather than shown as if
// it were current.
export const STALE_AFTER_MS = 15 * 60_000;

export function isStale(timestamp: number): boolean {
  return timestamp > 0 && Date.now() - timestamp > STALE_AFTER_MS;
}

export function since(timestamp: number): string {
  if (!timestamp) return '';
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

const WINDOW_NAMES: Record<string, string> = {
  five_hour: 'Session (5h)',
  seven_day: 'Weekly (7d)',
  monthly: 'Monthly',
  seven_day_opus: 'Opus weekly',
  seven_day_sonnet: 'Sonnet weekly',
  seven_day_scoped: 'Model weekly',
};

// Compact token counts: 950 → "950", 12_400 → "12.4K", 5_200_000 → "5.2M".
export function compactTokens(value: number): string {
  if (!value) return '0';
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) {
    const v = value / 1000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}K`;
  }
  const v = value / 1_000_000;
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
}

// Model-scoped weekly windows arrive named after the model they cover, so the
// label is built rather than looked up.
export function windowLabel(window: string): string {
  const scoped = window.startsWith('seven_day_scoped:');
  if (scoped) return `${window.slice('seven_day_scoped:'.length)} weekly`;
  return WINDOW_NAMES[window] ?? window;
}

// resetsAt is unix seconds from the CLI, unlike every other timestamp here.
export function until(resetsAtSeconds: number): string {
  if (!resetsAtSeconds) return '';
  const minutes = Math.round((resetsAtSeconds * 1000 - Date.now()) / 60_000);
  if (minutes <= 0) return 'resetting';
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `resets in ${hours}h` : `resets in ${Math.floor(hours / 24)}d`;
}

export const QuotaBar: React.FC<{ limit: domain.RateLimit }> = ({ limit }) => {
  const used = limit.usedPercent;
  const known = typeof used === 'number';
  const label = windowLabel(limit.window);
  const tone = !known || used < 75 ? 'bg-white/55' : used < 90 ? 'bg-amber-300/80' : 'bg-rose-400/85';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium font-['Geist'] text-white/70 tracking-tight">
          {label}
        </span>
        <span className="text-[11px] font-semibold font-['Geist'] text-white/90 tabular-nums">
          {known ? `${used}%` : '—'}
        </span>
      </div>

      <div className="h-[4px] rounded-full bg-white/10 overflow-hidden">
        {known && (
          <div
            className={`h-full rounded-full ${tone} transition-[width] duration-300 ease-out`}
            style={{ width: `${Math.min(100, Math.max(used, used > 0 ? 2 : 0))}%` }}
          />
        )}
      </div>
      {!!limit.resetsAt && (
        <span className="text-[10px] font-['Geist'] text-white/35 tracking-tight">
          {until(limit.resetsAt)}
        </span>
      )}
    </div>
  );
};
