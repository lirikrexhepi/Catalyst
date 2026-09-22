import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { domain, session } from '../../../wailsjs/go/models';

export interface UsagePanelProps {
  report: session.UsageReport | null;
  error?: string | null;
  onClose: () => void;
  className?: string;
}

const DRIVER_NAMES: Record<string, string> = {
  claude: 'Claude Code',
  antigravity: 'Antigravity',
  codex: 'Codex',
  opencode: 'OpenCode',
};

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
  seven_day_opus: 'Opus weekly',
  seven_day_sonnet: 'Sonnet weekly',
  seven_day_scoped: 'Model weekly',
};

// Model-scoped weekly windows arrive named after the model they cover, so the
// label is built rather than looked up.
function windowLabel(window: string): string {
  const scoped = window.startsWith('seven_day_scoped:');
  if (scoped) return `${window.slice('seven_day_scoped:'.length)} weekly`;
  return WINDOW_NAMES[window] ?? window;
}

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

export const UsagePanel: React.FC<UsagePanelProps> = ({
  report,
  error,
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
  const quotaDrivers = drivers.filter((driver) => (driver.limits?.length ?? 0) > 0);
  const quotaIssues = drivers
    .filter((driver) => !!driver.limitsError)
    .map((driver) => ({ driver: driver.driver, message: driver.limitsError as string }));
  const empty = quotaDrivers.length === 0 && quotaIssues.length === 0 && !error;

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
      tint="var(--theme-panel-bg, rgba(18, 20, 26, 0.88))"
      shadow="apple"
      border="1px solid var(--theme-panel-border, rgba(255, 255, 255, 0.10))"
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
        <button
          type="button"
          title="Close"
          onClick={onClose}
          className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
        >
          <span className="material-symbols-rounded text-[16px] leading-none">close</span>
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25">
          <span className="text-[11px] font-medium font-['Geist'] text-red-200/90 leading-relaxed">
            {error}
          </span>
        </div>
      )}

      {empty && (
        <div className="px-4 pb-5 pt-1">
          <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
            Reading your plan usage…
          </p>
        </div>
      )}

      {(quotaDrivers.length > 0 || quotaIssues.length > 0) && (
        <div className="mx-4 mb-4 flex flex-col gap-3 shrink-0">
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
                    title="Fetched from your subscription while the panel is open. If the account cannot be reached, the CLI's own cached figures are shown instead and this stamp reports how old they are."
                    className={`text-[9px] font-['Geist'] tracking-tight ${
                      isStale(driver.limitsFetchedAt) ? 'text-amber-300/60' : 'text-white/30'
                    }`}
                  >
                    Updated {since(driver.limitsFetchedAt)}
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
    </LiquidGlass>
  );
};

export default UsagePanel;
