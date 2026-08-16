import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { providerIcon } from '../orchestrator/providerIcons';
import { domain, session } from '../../../wailsjs/go/models';

export interface UsagePanelProps {
  report: session.UsageReport | null;
  error?: string | null;
  onRefresh: () => void;
  onReset: () => void;
  onClose: () => void;
  className?: string;
}

const DRIVER_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  antigravity: 'Antigravity',
  codex: 'Codex',
  opencode: 'OpenCode',
};

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

function money(value: number): string {
  if (value <= 0) return '—';
  return value < 0.01 ? '<$0.01' : `$${value.toFixed(2)}`;
}

// Past this the figures are old enough to mislead — the 5h window can move
// several points in that time — so the label is flagged rather than shown as if
// it were current.
const STALE_AFTER_MS = 15 * 60_000;

function isStale(timestamp: number): boolean {
  return timestamp > 0 && Date.now() - timestamp > STALE_AFTER_MS;
}

function since(timestamp: number): string {
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
  opus_seven_day: 'Opus weekly',
};

// resetsAt is unix seconds from the CLI, unlike every other timestamp here.
function until(resetsAtSeconds: number): string {
  if (!resetsAtSeconds) return '';
  const minutes = Math.round((resetsAtSeconds * 1000 - Date.now()) / 60_000);
  if (minutes <= 0) return 'resetting';
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `resets in ${hours}h` : `resets in ${Math.floor(hours / 24)}d`;
}

const QuotaBar: React.FC<{ limit: domain.RateLimit }> = ({ limit }) => {
  const used = limit.usedPercent;
  const known = typeof used === 'number';
  const label = WINDOW_NAMES[limit.window] ?? limit.window;
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

const Stat: React.FC<{ label: string; value: string; muted?: boolean }> = ({
  label,
  value,
  muted,
}) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[10px] font-medium font-['Geist'] text-white/40 tracking-tight uppercase">
      {label}
    </span>
    <span
      className={`text-[13px] font-semibold font-['Geist'] tabular-nums tracking-tight ${
        muted ? 'text-white/60' : 'text-white'
      }`}
    >
      {value}
    </span>
  </div>
);

export const UsagePanel: React.FC<UsagePanelProps> = ({
  report,
  error,
  onRefresh,
  onReset,
  onClose,
  className = '',
}) => {
  // Relative timestamps are derived from the clock, not from the report, so
  // without a tick they freeze whenever the underlying figures are unchanged —
  // making a working panel look stalled.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const drivers = report?.drivers ?? [];
  const totals = report?.totals;
  const grandTotal = (totals?.inputTokens ?? 0) + (totals?.outputTokens ?? 0);
  const quotaDrivers = drivers.filter((driver) => (driver.limits?.length ?? 0) > 0);
  // A CLI that only contributed quota has no tokens to break down, so it would
  // otherwise render an empty card under the totals.
  const spendDrivers = drivers.filter(
    (driver) => driver.inputTokens + driver.outputTokens > 0,
  );
  const quotaIssues = drivers
    .filter((driver) => !!driver.limitsError)
    .map((driver) => ({ driver: driver.driver, message: driver.limitsError as string }));

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={20}
      bezelWidth={18}
      glassThickness={24}
      refractionScale={0.8}
      blur={0.4}
      specularOpacity={0.8}
      specularSaturation={6}
      lightAngle={-45}
      tint="rgba(0, 0, 0, 0.22)"
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.18)"
      frost={16}
      frostSaturation={170}
      className={`w-[360px] flex flex-col ${className}`}
      style={{
        boxShadow:
          '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[18px] text-white/80 leading-none">
            speed
          </span>
          <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
            Usage
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Re-read usage now"
            onClick={onRefresh}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">refresh</span>
          </button>
          <button
            type="button"
            title="Clear token counters"
            onClick={onReset}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">restart_alt</span>
          </button>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">close</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2.5 px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25">
          <span className="text-[11px] font-medium font-['Geist'] text-red-200/90 leading-relaxed">
            {error}
          </span>
        </div>
      )}

      {(quotaDrivers.length > 0 || quotaIssues.length > 0) && (
        <div className="mx-4 mb-3 flex flex-col gap-3 shrink-0">
          {quotaDrivers.map((driver) => (
            <div
              key={`quota-${driver.driver}`}
              className="p-3 rounded-[12px] bg-white/[0.05] border border-white/[0.09] flex flex-col gap-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase">
                  {DRIVER_NAMES[driver.driver] ?? driver.driver} plan
                </span>
                {!!driver.limitsFetchedAt && (
                  <span
                    title="These figures come from the CLI's own cache, which only refreshes when a Claude client fetches usage. Catalyst re-reads it on open but cannot trigger that fetch."
                    className={`text-[9px] font-['Geist'] tracking-tight ${
                      isStale(driver.limitsFetchedAt) ? 'text-amber-300/60' : 'text-white/30'
                    }`}
                  >
                    CLI data {since(driver.limitsFetchedAt)}
                  </span>
                )}
              </div>
              {driver.limits?.map((limit) => (
                <QuotaBar key={`${driver.driver}-${limit.window}`} limit={limit} />
              ))}
            </div>
          ))}

          {/* Why a meter is missing, per CLI. Left blank it would read as a bug
              rather than a signed-out or offline provider. */}
          {quotaIssues.map(({ driver, message }) => (
            <span
              key={`quota-error-${driver}`}
              className="text-[10px] font-['Geist'] text-white/35 tracking-tight leading-relaxed px-0.5"
            >
              {DRIVER_NAMES[driver] ?? driver}: {message}
            </span>
          ))}
        </div>
      )}

      <div className="mx-4 mb-3 p-3 rounded-[12px] bg-white/[0.05] border border-white/[0.09] shrink-0">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Tokens" value={compact(grandTotal)} />
          <Stat label="Cost" value={money(totals?.costUsd ?? 0)} />
          <Stat label="Turns" value={String(totals?.turns ?? 0)} />
        </div>
      </div>

      {spendDrivers.length === 0 ? (
        <div className="px-4 pb-5 pt-1">
          <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
            No agent activity yet. Token totals appear here once an agent runs.
          </p>
        </div>
      ) : (
        <ScrollArea maxHeight={340} className="px-4 pb-4 flex flex-col gap-2">
          {spendDrivers.map((driver) => {
            const icon = providerIcon(driver.driver);
            const total = driver.inputTokens + driver.outputTokens;
            const share = grandTotal > 0 ? (total / grandTotal) * 100 : 0;

            return (
              <div
                key={driver.driver}
                className="p-2.5 rounded-[11px] bg-white/[0.04] border border-white/[0.08] flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  {icon ? (
                    <img src={icon} alt="" className="w-4 h-4 object-contain shrink-0" draggable={false} />
                  ) : (
                    <span className="w-4 h-4 rounded-[5px] bg-white/15 text-[9px] font-bold text-white/70 flex items-center justify-center shrink-0">
                      {driver.driver.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[12px] font-medium font-['Geist'] text-white/95 tracking-tight flex-1 truncate">
                    {DRIVER_NAMES[driver.driver] ?? driver.driver}
                  </span>
                  <span className="text-[11px] font-semibold font-['Geist'] text-white/70 tabular-nums">
                    {compact(total)}
                  </span>
                </div>

                <div className="h-[3px] rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/55 transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.max(share, total > 0 ? 2 : 0)}%` }}
                  />
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <Stat label="In" value={compact(driver.inputTokens)} muted />
                  <Stat label="Out" value={compact(driver.outputTokens)} muted />
                  <Stat label="Cached" value={compact(driver.cacheReadTokens)} muted />
                  <Stat label="Cost" value={money(driver.costUsd)} muted />
                </div>

                {!!driver.lastActiveAt && (
                  <span className="text-[10px] font-['Geist'] text-white/35 tracking-tight">
                    {driver.sessions} session{driver.sessions === 1 ? '' : 's'} · {since(driver.lastActiveAt)}
                  </span>
                )}
              </div>
            );
          })}
        </ScrollArea>
      )}
    </LiquidGlass>
  );
};

export default UsagePanel;
