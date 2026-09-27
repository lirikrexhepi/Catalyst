import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CleanDropdown } from '../common/CleanDropdown';
import { providerIcon } from '../orchestrator/providerIcons';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import {
  AccountStatus,
  ActiveProject,
  AddAccount,
  ListProviders,
  RemoveAccount,
  RenameAccount,
  SetProjectAccount,
  SignInAccount,
} from '../../../wailsjs/go/main/App';
import { domain, projects } from '../../../wailsjs/go/models';

interface Status {
  signedIn: boolean;
  known: boolean;
  detail?: string;
  checking?: boolean;
}

const COPYABLE = new Set(['claude']);

const SIGN_IN_POLL_MS = 3000;
const SIGN_IN_POLL_LIMIT = 100;

const statusKey = (driver: string, id: string) => `${driver}:${id}`;

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export const AccountsSection: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const [snapshots, setSnapshots] = useState<domain.ProviderSnapshot[]>([]);
  const [project, setProject] = useState<projects.Project | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [copySettings, setCopySettings] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const polls = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const [list, active] = await Promise.all([ListProviders(false), ActiveProject().catch(() => null)]);
      setSnapshots((list ?? []).filter((snapshot) => (snapshot.accounts?.length ?? 0) > 0));
      setProject(active ?? null);
    } catch (cause) {
      setError(message(cause));
    }
  }, []);

  const check = useCallback(async (driver: string, id: string) => {
    const key = statusKey(driver, id);
    setStatuses((previous) => ({ ...previous, [key]: { ...(previous[key] ?? { signedIn: false, known: false }), checking: true } }));
    try {
      const status = await AccountStatus(driver, id);
      setStatuses((previous) => ({ ...previous, [key]: { ...status, checking: false } }));
      return status.signedIn;
    } catch (cause) {
      setStatuses((previous) => ({ ...previous, [key]: { signedIn: false, known: false, detail: message(cause), checking: false } }));
      return false;
    }
  }, []);

  useEffect(() => {
    void load();
    const running = polls.current;
    return () => {
      Object.values(running).forEach((timer) => window.clearInterval(timer));
    };
  }, [load]);

  useEffect(() => {
    for (const snapshot of snapshots) {
      if (snapshot.availability !== 'ready') continue;
      for (const account of snapshot.accounts ?? []) {
        if (!statuses[statusKey(snapshot.driver, account.id)]) void check(snapshot.driver, account.id);
      }
    }
  }, [snapshots, statuses, check]);

  const refreshEverywhere = useCallback(async () => {
    await load();
    await useOrchestratorStore.getState().loadProviders(true);
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const signIn = (driver: string, id: string) =>
    run(async () => {
      await SignInAccount(driver, id);
      setNotice('Finish signing in in the window that opened. The status here updates on its own.');
      const key = statusKey(driver, id);
      window.clearInterval(polls.current[key]);
      let tries = 0;
      polls.current[key] = window.setInterval(async () => {
        tries += 1;
        const done = await check(driver, id);
        if (done || tries >= SIGN_IN_POLL_LIMIT) {
          window.clearInterval(polls.current[key]);
          delete polls.current[key];
        }
      }, SIGN_IN_POLL_MS);
    });

  const add = (driver: string) =>
    run(async () => {
      const result = await AddAccount(driver, name, COPYABLE.has(driver) && copySettings);
      setAdding(null);
      setName('');
      const copied = result.copied?.length ? ` Copied ${result.copied.join(', ')}.` : '';
      setNotice(`Added ${result.account.name}. Sign in to use it.${copied}`);
      if (result.warning) setError(result.warning);
      await refreshEverywhere();
    });

  const rename = (driver: string, id: string) =>
    run(async () => {
      await RenameAccount(driver, id, renameText);
      setRenaming(null);
      await refreshEverywhere();
    });

  const remove = (driver: string, id: string) =>
    run(async () => {
      await RemoveAccount(driver, id);
      setConfirmRemove(null);
      setNotice('Removed. Its folder and sign-in stay on disk until you delete them yourself.');
      await refreshEverywhere();
    });

  const setProjectDefault = (driver: string, id: string) =>
    run(async () => {
      if (!project) return;
      const updated = await SetProjectAccount(project.id, driver, id === 'default' ? '' : id);
      setProject(updated);
    });

  if (snapshots.length === 0) return null;

  const row = `flex flex-col gap-1.5 p-2.5 rounded-[10px] ${isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'}`;
  const titleCls = `text-[12px] font-medium font-['Geist'] tracking-tight truncate ${isLight ? 'text-[#030303]' : 'text-white/90'}`;
  const detailCls = `text-[10px] font-['Geist'] tracking-tight leading-snug truncate ${isLight ? 'text-black/50' : 'text-white/40'}`;
  const linkCls = `text-[11px] font-medium font-['Geist'] tracking-tight transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${
    isLight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'
  }`;
  const inputCls = `h-[26px] flex-1 min-w-0 px-2 rounded-[7px] text-[12px] font-['Geist'] outline-none border ${
    isLight ? 'bg-white/70 border-black/10 text-black' : 'bg-white/[0.06] border-white/10 text-white'
  }`;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2 px-0.5 pt-1.5">
        <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase">Accounts</span>
      </div>

      {snapshots.map((snapshot) => {
        const driver = snapshot.driver;
        const accounts = snapshot.accounts ?? [];
        const projectDefault = project?.accounts?.[driver] || 'default';
        return (
          <div key={driver} className={row}>
            <div className="flex items-center gap-2">
              {providerIcon(driver, isLight) && (
                <img src={providerIcon(driver, isLight)} alt="" draggable={false} className="w-[16px] h-[16px] object-contain shrink-0" />
              )}
              <span className={titleCls}>{snapshot.displayName}</span>
            </div>

            {accounts.map((account) => {
              const key = statusKey(driver, account.id);
              const status = statuses[key];
              const label = status?.checking && !status.known
                ? 'Checking…'
                : status?.known
                  ? status.signedIn
                    ? status.detail || 'Signed in'
                    : 'Not signed in'
                  : status?.detail || (snapshot.availability === 'ready' ? '' : 'CLI not found');
              return (
                <div key={account.id} className="flex items-center justify-between gap-2 pl-6">
                  {renaming === key ? (
                    <form
                      className="flex items-center gap-1.5 flex-1 min-w-0"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rename(driver, account.id);
                      }}
                    >
                      <input autoFocus value={renameText} onChange={(event) => setRenameText(event.target.value)} className={inputCls} />
                      <button type="submit" disabled={busy || !renameText.trim()} className={linkCls}>Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className={linkCls}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-col min-w-0">
                        <span className={titleCls}>
                          {account.name}
                          {account.id === 'default' && <span className={detailCls}> · uses the CLI's usual sign-in</span>}
                        </span>
                        <span className={detailCls} title={status?.detail}>
                          {status?.known && (
                            <span className={status.signedIn ? 'text-emerald-400/80' : 'text-amber-400/80'}>● </span>
                          )}
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        {confirmRemove === key ? (
                          <>
                            <button type="button" disabled={busy} onClick={() => void remove(driver, account.id)} className={`${linkCls} !text-red-400`}>Remove</button>
                            <button type="button" onClick={() => setConfirmRemove(null)} className={linkCls}>Keep</button>
                          </>
                        ) : (
                          <>
                            <button type="button" disabled={busy} onClick={() => void signIn(driver, account.id)} className={linkCls}>
                              {status?.signedIn ? 'Sign in again' : 'Sign in'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenaming(key);
                                setRenameText(account.name);
                              }}
                              className={linkCls}
                            >
                              Rename
                            </button>
                            {account.id !== 'default' && (
                              <button type="button" onClick={() => setConfirmRemove(key)} className={linkCls}>Remove</button>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {adding === driver ? (
              <form
                className="flex flex-col gap-1.5 pl-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void add(driver);
                }}
              >
                <div className="flex items-center gap-1.5">
                  <input autoFocus placeholder="Account name, e.g. Personal" value={name} onChange={(event) => setName(event.target.value)} className={inputCls} />
                  <button type="submit" disabled={busy || !name.trim()} className={linkCls}>Add</button>
                  <button type="button" onClick={() => setAdding(null)} className={linkCls}>Cancel</button>
                </div>
                {COPYABLE.has(driver) && (
                  <label className={`flex items-center gap-1.5 ${detailCls} cursor-pointer`}>
                    <input type="checkbox" checked={copySettings} onChange={(event) => setCopySettings(event.target.checked)} />
                    Copy my settings from {accounts[0]?.name || 'Default'} (CLAUDE.md, settings, skills, agents, commands, output styles). Never copies sign-in or history.
                  </label>
                )}
              </form>
            ) : (
              <div className="flex items-center justify-between gap-2 pl-6">
                <button type="button" onClick={() => { setAdding(driver); setName(''); }} className={linkCls}>+ Add account</button>
              </div>
            )}

            {project && accounts.length > 1 && (
              <div className="flex items-center justify-between gap-2 pl-6 pt-0.5">
                <span className={detailCls}>{project.name} uses</span>
                <CleanDropdown
                  value={projectDefault}
                  options={accounts.map((account) => ({ value: account.id, label: account.name }))}
                  disabled={busy}
                  onChange={(value) => void setProjectDefault(driver, value)}
                  className="w-[130px] shrink-0"
                />
              </div>
            )}
          </div>
        );
      })}

      {notice && (
        <div className={`text-[10px] font-medium font-['Geist'] px-2 py-1 rounded-[6px] ${isLight ? 'bg-black/[0.05] text-black/70' : 'bg-white/[0.06] text-white/70'}`}>
          {notice}
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
