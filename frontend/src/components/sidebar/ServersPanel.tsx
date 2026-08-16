import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { servers } from '../../../wailsjs/go/models';

export interface ServersPanelProps {
  groups: servers.Group[];
  error?: string | null;
  isLoading: boolean;
  stopping: number | null;
  onStop: (pid: number) => void;
  onRefresh: () => void;
  onClose: () => void;
  className?: string;
}

const KIND_LABELS: Record<string, string> = {
  node: 'Node',
  python: 'Python',
  php: 'PHP',
  ruby: 'Ruby',
  java: 'Java',
  dotnet: '.NET',
  go: 'Go',
  rust: 'Rust',
  deno: 'Deno',
  bun: 'Bun',
  caddy: 'Caddy',
  nginx: 'nginx',
};

// Trims the noise a spawned command accumulates so the row shows what was run,
// not an absolute path to an interpreter.
function shortCommand(command: string): string {
  const cleaned = command.replace(/"/g, '').trim();
  if (!cleaned) return '';
  const withoutPaths = cleaned.replace(/[A-Za-z]:\\[^\s]*\\/g, '').replace(/\/[^\s]*\//g, '');
  return withoutPaths.length > 64 ? `${withoutPaths.slice(0, 64)}…` : withoutPaths;
}

const ServerRow: React.FC<{
  server: servers.Server;
  isStopping: boolean;
  onStop: (pid: number) => void;
}> = ({ server, isStopping, onStop }) => (
  <div className="flex items-center gap-2.5 p-2 rounded-[10px] bg-white/[0.04] border border-white/[0.08]">
    <span className="text-[12px] font-semibold font-['Geist'] text-white tabular-nums shrink-0 w-[52px]">
      :{server.port}
    </span>

    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
      <span className="text-[11px] font-medium font-['Geist'] text-white/90 tracking-tight truncate">
        {KIND_LABELS[server.kind] ?? server.name}
        <span className="text-white/35 font-normal"> · pid {server.pid}</span>
      </span>
      {!!server.command && (
        <span className="text-[10px] font-mono text-white/40 truncate">
          {shortCommand(server.command)}
        </span>
      )}
    </div>

    <button
      type="button"
      title={`Stop process ${server.pid}`}
      disabled={isStopping}
      onClick={() => onStop(server.pid)}
      className={`h-[24px] px-2 rounded-[7px] text-[11px] font-medium font-['Geist'] tracking-tight transition-all duration-150 shrink-0 ${
        isStopping
          ? 'bg-white/5 text-white/30 cursor-default'
          : 'bg-white/8 hover:bg-rose-500/25 text-white/70 hover:text-rose-100 active:scale-95 cursor-pointer'
      }`}
    >
      {isStopping ? 'Stopping…' : 'Stop'}
    </button>
  </div>
);

export const ServersPanel: React.FC<ServersPanelProps> = ({
  groups,
  error,
  isLoading,
  stopping,
  onStop,
  onRefresh,
  onClose,
  className = '',
}) => {
  const total = groups.reduce((sum, group) => sum + (group.servers?.length ?? 0), 0);

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
      className={`w-[380px] flex flex-col ${className}`}
      style={{
        boxShadow:
          '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[18px] text-white/80 leading-none">
            terminal
          </span>
          <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
            Servers
          </span>
          {total > 0 && (
            <span className="text-[11px] font-medium font-['Geist'] text-white/35 tabular-nums">
              {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Rescan"
            onClick={onRefresh}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">refresh</span>
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

      {total === 0 ? (
        <div className="px-4 pb-5 pt-1">
          <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
            {isLoading ? 'Scanning…' : 'No development servers are listening right now.'}
          </p>
        </div>
      ) : (
        <ScrollArea maxHeight={380} className="px-4 pb-4 flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.threadId || 'unowned'} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase truncate">
                  {group.title}
                </span>
                <span className="text-[10px] font-['Geist'] text-white/30 tabular-nums shrink-0">
                  {group.servers?.length ?? 0}
                </span>
              </div>
              {group.servers?.map((server) => (
                <ServerRow
                  key={server.pid}
                  server={server}
                  isStopping={stopping === server.pid}
                  onStop={onStop}
                />
              ))}
            </div>
          ))}
        </ScrollArea>
      )}
    </LiquidGlass>
  );
};

export default ServersPanel;
