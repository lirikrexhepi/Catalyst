import React, { useEffect, useState } from 'react';
import { CleanDropdown } from '../common/CleanDropdown';
import { GetBackgroundSettings, SetKeepRunningOnClose, SetStartMode } from '../../../wailsjs/go/main/App';
import { SettingsRow, Switch } from './SettingsParts';

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
  off: 'Only runs while the window is open',
  login: 'Runs in the background after you sign in',
  boot: 'Runs before sign-in, so the phone can reach a PC turned on remotely',
};

export const BackgroundRows: React.FC<{ isLight: boolean }> = ({ isLight }) => {
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
  const keep = state.keepRunningOnClose;

  return (
    <>
      <SettingsRow
        title="Start automatically"
        hint={busy === 'start' && state.startMode !== 'boot' ? 'Waiting for Windows to confirm…' : START_DETAIL[state.startMode]}
        isLight={isLight}
        control={
          <CleanDropdown
            value={state.startMode}
            options={START_OPTIONS}
            disabled={busy !== null}
            onChange={(value) => void apply('start', () => SetStartMode(value))}
            className="w-[168px] shrink-0"
          />
        }
      >
        {busy === 'start' && (
          <span className={`text-[11px] leading-snug ${isLight ? 'text-black/50' : 'text-white/45'}`}>
            If Windows asks for permission or your password, that's this setting. Only Task Scheduler stores it.
          </span>
        )}
        {error && <span className="text-[11px] leading-snug text-red-300/90">{error}</span>}
      </SettingsRow>
      <SettingsRow
        title="Keep running after closing"
        hint="Phone and notifications keep working; running agents stop"
        isLight={isLight}
        control={
          <Switch on={keep} onChange={() => busy === null && void apply('keep', () => SetKeepRunningOnClose(!keep))} isLight={isLight} label="Keep running after closing" />
        }
      />
    </>
  );
};

export const BackgroundSection = BackgroundRows;
