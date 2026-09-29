import React from 'react';
import { CleanDropdown } from '../common/CleanDropdown';
import { providerIcon } from '../orchestrator/providerIcons';
import { DefaultModels, ProviderDefault } from './useDefaultModels';
import { COPYABLE, emailFromDetail, ProviderAccounts, statusKey } from './useProviderAccounts';
import { ClaudeUpdateState } from '../orchestrator/useClaudeUpdate';
import { compactTokens, isStale, QuotaBar, since, usageKey, UsageRing, until } from './usageBars';
import { domain, session } from '../../../wailsjs/go/models';

export interface ProviderCardProps {
  entry: ProviderDefault;
  defaultModels: DefaultModels;
  accounts: ProviderAccounts;
  snapshot?: domain.ProviderSnapshot;
  usage: session.DriverUsage[];
  claudeUpdate: ClaudeUpdateState | null;
  isLight: boolean;
}

/**
 * One provider, fully self-contained: enable toggle, model and effort picks,
 * its accounts and its usage. Replaces the old split across the Providers &
 * Models, Accounts and Usage sections.
 */
export const ProviderCard: React.FC<ProviderCardProps> = ({
  entry,
  defaultModels,
  accounts,
  snapshot,
  usage,
  claudeUpdate,
  isLight,
}) => {
  const { provider, models, modelId, enabled, effortId, effortChoices } = entry;
  const showEffort = enabled && modelId !== '' && effortChoices.length > 0;
  const options = [
    { value: '', label: 'CLI default' },
    ...models.map((m) => ({ value: m.id, label: m.name })),
  ];

  const titleCls = `text-[12px] font-medium font-['Geist'] tracking-tight truncate ${isLight ? 'text-[#030303]' : 'text-white/90'}`;
  const detailCls = `text-[10px] font-['Geist'] tracking-tight leading-snug truncate ${isLight ? 'text-black/50' : 'text-white/40'}`;
  const groupLabelCls = `text-[10px] font-semibold font-['Geist'] tracking-tight uppercase ${isLight ? 'text-black/40' : 'text-white/40'}`;
  const linkCls = `text-[11px] font-medium font-['Geist'] tracking-tight transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${
    isLight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'
  }`;
  const inputCls = `h-[26px] flex-1 min-w-0 px-2 rounded-[7px] text-[12px] font-['Geist'] outline-none border ${
    isLight ? 'bg-white/70 border-black/10 text-black' : 'bg-white/[0.06] border-white/10 text-white'
  }`;

  const driverAccounts = snapshot?.accounts ?? [];
  const projectDefault = accounts.project?.accounts?.[provider.id] || 'default';
  const [openUsage, setOpenUsage] = React.useState<string | null>(null);
  const logo = provider.icon ? providerIcon(provider.id, isLight) || provider.icon : undefined;

  return (
    <div className={`flex flex-col gap-2.5 p-3 rounded-[12px] ${isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'}`}>
      {/* Header: icon, name, enable toggle */}
      <div className="flex items-center gap-2">
        {provider.icon ? (
          <img
            src={providerIcon(provider.id, isLight) || provider.icon}
            alt=""
            draggable={false}
            className="w-[18px] h-[18px] object-contain shrink-0 rounded-[3px]"
          />
        ) : (
          <span className={`material-symbols-rounded text-[18px] leading-none shrink-0 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
            smart_toy
          </span>
        )}
        <span className={`text-[13px] font-semibold font-['Geist'] tracking-tight truncate flex-1 ${isLight ? 'text-[#030303]' : 'text-white/95'}`}>
          {provider.name}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          title={enabled ? `Disable ${provider.name}` : `Enable ${provider.name}`}
          onClick={() => void defaultModels.toggle(provider.id, !enabled)}
          className={`w-8 h-[18px] rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ${
            enabled
              ? isLight ? 'bg-[#007AFF]' : 'bg-white/90'
              : isLight ? 'bg-black/15' : 'bg-white/15'
          }`}
        >
          <div
            className={`w-3.5 h-3.5 rounded-full transition-transform duration-200 ease-out ${
              enabled
                ? isLight ? 'translate-x-3.5 bg-white shadow-sm' : 'translate-x-3.5 bg-black shadow-sm'
                : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
            }`}
          />
        </button>
      </div>

      {/* Model + effort */}
      <CleanDropdown
        value={modelId}
        options={options}
        disabled={!enabled || defaultModels.isSaving === provider.id || models.length === 0}
        onChange={(val) => void defaultModels.select(provider.id, val)}
        className="w-full"
      />
      {showEffort && (
        <div className="flex items-center justify-between gap-2.5">
          <span className={`text-[11px] font-['Geist'] tracking-tight ${isLight ? 'text-black/50' : 'text-white/45'}`}>
            Effort
          </span>
          <CleanDropdown
            value={effortId}
            options={effortChoices}
            disabled={!enabled || defaultModels.isSaving === provider.id}
            onChange={(val) => void defaultModels.selectEffort(provider.id, val)}
            className="w-[145px]"
          />
        </div>
      )}

      {/* CLI release advisory, Claude only for now. */}
      {provider.id === 'claude' && claudeUpdate?.status && (
        <div className="flex items-center justify-between gap-2.5 min-h-[22px]">
          {claudeUpdate.status.available ? (
            <>
              <span className={`text-[11px] font-['Geist'] tracking-tight tabular-nums ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                {claudeUpdate.status.installed} → {claudeUpdate.status.latest}
              </span>
              <button
                type="button"
                disabled={claudeUpdate.updating}
                onClick={() => void claudeUpdate.startUpdate()}
                className={`h-[22px] px-2.5 rounded-full text-[11px] font-medium font-['Geist'] active:scale-95 transition-all cursor-pointer shrink-0 ${
                  claudeUpdate.updating
                    ? isLight ? 'text-black/35 cursor-default' : 'text-white/35 cursor-default'
                    : 'bg-[#007AFF] hover:bg-[#0A84FF] text-white'
                }`}
              >
                {claudeUpdate.updating ? 'Updating…' : 'Update'}
              </button>
            </>
          ) : (
            <span className={`text-[11px] font-['Geist'] tracking-tight ${isLight ? 'text-black/35' : 'text-white/30'}`}>
              Claude Code up to date
            </span>
          )}
        </div>
      )}
      {provider.id === 'claude' && (claudeUpdate?.output || claudeUpdate?.error) && (
        <div className={`text-[11px] font-['Geist'] tracking-tight leading-snug ${
          claudeUpdate.error
            ? isLight ? 'text-red-600/90' : 'text-red-300/90'
            : isLight ? 'text-black/50' : 'text-white/50'
        }`}>
          {claudeUpdate.error ?? claudeUpdate.output}
        </div>
      )}

      {/* Accounts */}
      {snapshot && (
        <div className="flex flex-col gap-1.5 pt-0.5">
          <span className={groupLabelCls}>Accounts</span>
          {driverAccounts.map((account) => {
            const key = statusKey(provider.id, account.id);
            const status = accounts.statuses[key];
            const label = status?.checking && !status.known
              ? 'Checking…'
              : status?.known
                ? status.signedIn
                  ? status.detail || 'Signed in'
                  : 'Not signed in'
                : status?.detail || (snapshot.availability === 'ready' ? '' : 'CLI not found');
            const email = emailFromDetail(status?.detail);
            const title = email || account.name;
            const sub = email
              ? account.name.toLowerCase() === email.toLowerCase() ? 'Signed in' : account.name
              : label;
            return (
              <div key={account.id} className="flex items-center justify-between gap-2">
                {accounts.renaming === key ? (
                  <form
                    className="flex items-center gap-1.5 flex-1 min-w-0"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void accounts.rename(provider.id, account.id);
                    }}
                  >
                    <input autoFocus value={accounts.renameText} onChange={(event) => accounts.setRenameText(event.target.value)} className={inputCls} />
                    <button type="submit" disabled={accounts.busy || !accounts.renameText.trim()} className={linkCls}>Save</button>
                    <button type="button" onClick={() => accounts.setRenaming(null)} className={linkCls}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-col min-w-0">
                      <span className={titleCls} title={email ? status?.detail : undefined}>
                        {title}
                      </span>
                      {sub !== '' && (
                        <span className={detailCls} title={status?.detail}>
                          {status?.known && !email && (
                            <span className={status.signedIn ? 'text-emerald-400/80' : 'text-amber-400/80'}>● </span>
                          )}
                          {sub}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {accounts.confirmRemove === key ? (
                        <>
                          <button type="button" disabled={accounts.busy} onClick={() => void accounts.remove(provider.id, account.id)} className={`${linkCls} !text-red-400`}>Remove</button>
                          <button type="button" onClick={() => accounts.setConfirmRemove(null)} className={linkCls}>Keep</button>
                        </>
                      ) : (
                        <>
                          <button type="button" disabled={accounts.busy} onClick={() => void accounts.signIn(provider.id, account.id)} className={linkCls}>
                            {status?.signedIn ? 'Sign in again' : 'Sign in'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              accounts.setRenaming(key);
                              accounts.setRenameText(account.name);
                            }}
                            className={linkCls}
                          >
                            Rename
                          </button>
                          {account.id !== 'default' && (
                            <button type="button" onClick={() => accounts.setConfirmRemove(key)} className={linkCls}>Remove</button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {accounts.adding === provider.id ? (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void accounts.add(provider.id);
              }}
            >
              <div className="flex items-center gap-1.5">
                <input autoFocus placeholder="Account name, e.g. Personal" value={accounts.name} onChange={(event) => accounts.setName(event.target.value)} className={inputCls} />
                <button type="submit" disabled={accounts.busy || !accounts.name.trim()} className={linkCls}>Add</button>
                <button type="button" onClick={() => accounts.setAdding(null)} className={linkCls}>Cancel</button>
              </div>
              {COPYABLE.has(provider.id) && (
                <label
                  className={`flex items-center gap-1.5 ${detailCls} cursor-pointer`}
                  title="Copies CLAUDE.md, settings, skills, agents, commands and output styles. Never copies sign-in or history."
                >
                  <input type="checkbox" checked={accounts.copySettings} onChange={(event) => accounts.setCopySettings(event.target.checked)} />
                  Copy settings from {driverAccounts[0]?.name || 'Default'}
                </label>
              )}
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => { accounts.setAdding(provider.id); accounts.setName(''); }} className={linkCls}>+ Add account</button>
            </div>
          )}

          {accounts.project && driverAccounts.length > 1 && (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className={detailCls}>{accounts.project.name} uses</span>
              <CleanDropdown
                value={projectDefault}
                options={driverAccounts.map((account) => ({ value: account.id, label: account.name }))}
                disabled={accounts.busy}
                onChange={(value) => void accounts.setProjectDefault(provider.id, value)}
                className="w-[130px] shrink-0"
              />
            </div>
          )}
        </div>
      )}

      {/* Usage, one compact ring row per account; expands to the full bars. */}
      {usage.length > 0 && (
        <div className="flex flex-col gap-1 pt-0.5">
          <span className={groupLabelCls}>Usage</span>
          {usage.map((entry) => {
            const key = usageKey(entry);
            const accountLabel = entry.accountName || (entry.account && entry.account !== 'default' ? entry.account : '');
            const primary = entry.limits?.find((l) => l.window === 'five_hour' && typeof l.usedPercent === 'number')
              ?? entry.limits?.find((l) => typeof l.usedPercent === 'number')
              ?? entry.limits?.[0];
            const used = primary?.usedPercent;
            const known = typeof used === 'number';
            const open = openUsage === key;
            const spend = (entry.inputTokens ?? 0) + (entry.outputTokens ?? 0) > 0 ||
              (entry.costUsd ?? 0) > 0 || (entry.turns ?? 0) > 0;
            const expandable = (entry.limits?.length ?? 0) > 0 || !!entry.limitsError;
            return (
              <div key={key} className="flex flex-col">
                <button
                  type="button"
                  disabled={!expandable}
                  onClick={() => setOpenUsage(open ? null : key)}
                  className={`w-full flex items-center gap-2.5 py-1 text-left rounded-[8px] transition-colors ${
                    expandable ? (isLight ? 'hover:bg-black/[0.04] cursor-pointer' : 'hover:bg-white/[0.05] cursor-pointer') : 'cursor-default'
                  }`}
                >
                  <UsageRing used={used} logo={logo} size={30} isLight={isLight} />
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className={`text-[12px] font-medium font-['Geist'] tracking-tight truncate ${isLight ? 'text-[#030303]' : 'text-white/90'}`}>
                      {accountLabel || 'This run'}
                    </span>
                    {!!primary?.resetsAt && (
                      <span className={`text-[10px] font-['Geist'] tracking-tight truncate ${isLight ? 'text-black/45' : 'text-white/40'}`}>
                        {until(primary.resetsAt)}
                      </span>
                    )}
                  </span>
                  {(entry.costUsd ?? 0) > 0 && (
                    <span className={`text-[11px] font-semibold font-['Geist'] tabular-nums ${isLight ? 'text-[#030303]' : 'text-white/90'}`}>
                      ${entry.costUsd.toFixed(2)}
                    </span>
                  )}
                  <span className={`text-[12px] font-semibold font-['Geist'] tabular-nums ${isLight ? 'text-[#030303]' : 'text-white/90'}`}>
                    {known ? `${used}%` : '—'}
                  </span>
                  {expandable && (
                    <span className={`material-symbols-rounded text-[15px] leading-none shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                      expand_more
                    </span>
                  )}
                </button>
                {open && (
                  <div className="flex flex-col gap-2 pl-[40px] pr-1 pb-1.5">
                    {spend && (
                      <div className={`flex items-center gap-3 text-[10px] font-['Geist'] tracking-tight tabular-nums ${isLight ? 'text-black/45' : 'text-white/45'}`}>
                        <span title="Input tokens">↓ {compactTokens(entry.inputTokens ?? 0)}</span>
                        <span title="Output tokens">↑ {compactTokens(entry.outputTokens ?? 0)}</span>
                        {(entry.turns ?? 0) > 0 && (
                          <span title="Turns">{entry.turns} turn{entry.turns === 1 ? '' : 's'}</span>
                        )}
                      </div>
                    )}
                    {entry.limits?.map((limit) => (
                      <QuotaBar key={`${key}-${limit.window}`} limit={limit} />
                    ))}
                    {!!entry.limitsFetchedAt && (
                      <span
                        title="Fetched from your subscription while Settings is open."
                        className={`text-[9px] font-['Geist'] tracking-tight self-end ${
                          isStale(entry.limitsFetchedAt) ? 'text-amber-300/60' : isLight ? 'text-black/30' : 'text-white/30'
                        }`}
                      >
                        Updated {since(entry.limitsFetchedAt)}
                      </span>
                    )}
                    {!!entry.limitsError && (
                      <span className={`text-[10px] font-['Geist'] tracking-tight leading-relaxed ${isLight ? 'text-black/40' : 'text-white/35'}`}>
                        {entry.limitsError}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
