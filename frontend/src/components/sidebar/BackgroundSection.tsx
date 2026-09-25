import React, { useEffect, useState } from 'react';
import { CleanDropdown } from '../common/CleanDropdown';
import { GetBackgroundSettings, SetKeepRunningOnClose, SetStartMode } from '../../../wailsjs/go/main/App';

type StartMode = 'off' | 'login' | 'boot';

interface Background {
  startMode: StartMode;
  keepRunningOnClose: boolean;
  supported: boolean;
}

const START_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'login', label: 'When I sign in' },
  { value: 'boot', label: 'When the PC turns on' },
];

const START_DETAIL: Record<StartMode, string> = {
  off: 'Orchestrator only runs while you have it open.',
  login: 'Runs in the background after you sign in to Windows.',
  boot: 'Runs before anyone signs in, so a PC turned on remotely is reachable from your phone.',
};

export const BackgroundSection: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const [state, setState] = useState<Background | null>(null);
  const [busy, setBusy] = useState<'start' | 'keep' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    GetBackgroundSettings()
      .then((s) => setState(s as Background))
      .catch((e) => setError(String(e)));
  }, []);

  const apply = async (kind: 'start' | 'keep', run: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      setState((await run()) as Background);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      GetBackgroundSettings().then((s) => setState(s as Background)).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  if (!state || !state.supported) return null;

  const row = `flex items-center justify-between gap-3 p-2.5 rounded-[10px] ${isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'}`;
  const titleCls = `text-[12px] font-medium font-['Geist'] tracking-tight ${isLight ? 'text-[#030303]' : 'text-white/90'}`;
  const detailCls = `text-[10px] font-['Geist'] tracking-tight leading-snug ${isLight ? 'text-black/50' : 'text-white/40'}`;
  const keep = state.keepRunningOnClose;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 px-0.5 pt-1.5">
        <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase">Background</span>
      </div>

      <div className={row}>
        <div className="flex flex-col min-w-0">
          <span className={titleCls}>Start automatically</span>
          <span className={detailCls}>
            {busy === 'start' && state.startMode !== 'boot'
              ? 'Waiting for Windows to confirm…'
              : START_DETAIL[state.startMode]}
          </span>
        </div>
        <CleanDropdown
          value={state.startMode}
          options={START_OPTIONS}
          disabled={busy !== null}
          onChange={(value) => void apply('start', () => SetStartMode(value))}
          className="w-[150px] shrink-0"
        />
      </div>

      <div className={row}>
        <div className="flex flex-col min-w-0">
          <span className={titleCls}>Keep running after closing</span>
          <span className={detailCls}>
            Closing the window switches to background mode, so your phone and notifications keep working. Agents still running stop.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={keep}
          aria-label="Keep running after closing"
          disabled={busy !== null}
          onClick={() => void apply('keep', () => SetKeepRunningOnClose(!keep))}
          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 disabled:opacity-60 ${
            keep ? (isLight ? 'bg-[#007AFF]' : 'bg-white/90') : isLight ? 'bg-black/15' : 'bg-white/15'
          }`}
        >
          <div
            className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
              keep
                ? isLight ? 'translate-x-4 bg-white shadow-sm' : 'translate-x-4 bg-black shadow-sm'
                : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
            }`}
          />
        </button>
      </div>

      {busy === 'start' && (
        <div className={`text-[10px] font-medium font-['Geist'] px-2 py-1 rounded-[6px] ${isLight ? 'bg-black/[0.05] text-black/70' : 'bg-white/[0.06] text-white/70'}`}>
          If Windows asks for permission or your password, that's this setting. Your password is only stored by Windows Task Scheduler.
        </div>
      )}
      {error && (
        <div className={`text-[10px] font-medium font-['Geist'] px-2 py-1 rounded-[6px] ${isLight ? 'bg-red-500/10 text-red-800 border border-red-500/20' : 'bg-red-500/15 text-red-200 border border-red-500/25'}`}>
          {error}
        </div>
      )}
    </>
  );
};
