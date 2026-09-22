import React from 'react';
import { servers } from '../../../wailsjs/go/models';
import { Terminal, Globe, Square } from 'lucide-react';
import { ScrollArea } from '../common/ScrollArea';

export interface AgentServersViewProps {
  threadId?: string;
  servers?: servers.Server[];
  onStopServer?: (pid: number) => void;
  onPreview?: () => void;
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

function shortCommand(command: string): string {
  const cleaned = command.replace(/"/g, '').trim();
  if (!cleaned) return '';
  const withoutPaths = cleaned.replace(/[A-Za-z]:\\[^\s]*\\/g, '').replace(/\/[^\s]*\//g, '');
  return withoutPaths.length > 55 ? `${withoutPaths.slice(0, 55)}…` : withoutPaths;
}

export const AgentServersView: React.FC<AgentServersViewProps> = ({
  servers = [],
  onStopServer,
  onPreview,
  className = '',
}) => {
  return (
    <div className={`flex flex-col w-full h-full p-4 select-none ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-white/80" />
          <span className="text-[13px] font-semibold text-white font-['Geist'] tracking-tight">
            Dev Servers
          </span>
          {servers.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {servers.length} active
            </span>
          )}
        </div>
      </div>

      {/* Server List or Empty State */}
      {servers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
            <Terminal size={20} className="text-white/35" />
          </div>
          <span className="text-[13px] font-medium text-white/80 font-['Geist'] mb-1">
            No servers running for this agent
          </span>
          <p className="text-[11.5px] text-white/40 font-['Geist'] max-w-[280px] leading-relaxed">
            When this agent launches a web server (e.g. Vite, Next.js, Node, Python), it will appear here with live port status and controls.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1 pr-1 flex flex-col gap-2">
          {servers.map((server) => {
            const hasPort = server.port > 0;
            return (
              <div
                key={server.pid}
                className="flex items-center justify-between p-3 rounded-[12px] bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Port Badge */}
                  <div className="flex flex-col items-center justify-center w-[54px] h-[38px] rounded-[8px] bg-white/[0.06] shrink-0">
                    <span className="text-[12.5px] font-bold font-mono text-emerald-400 tabular-nums">
                      {hasPort ? `:${server.port}` : '—'}
                    </span>
                    <span className="text-[9px] font-mono text-white/35">
                      {KIND_LABELS[server.kind] || server.name || 'proc'}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-semibold text-white tracking-tight truncate">
                        {server.name || KIND_LABELS[server.kind] || 'Process'}
                      </span>
                      <span className="text-[10px] text-white/35 font-mono">
                        PID {server.pid}
                      </span>
                    </div>
                    {server.command && (
                      <span className="text-[10.5px] font-mono text-white/50 truncate max-w-[240px]" title={server.command}>
                        {shortCommand(server.command)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasPort && onPreview && (
                    <button
                      type="button"
                      title="Open in card web preview"
                      onClick={onPreview}
                      className="flex items-center gap-1 h-[26px] px-2.5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] active:scale-95 text-white text-[11px] font-medium font-['Geist'] transition-all cursor-pointer"
                    >
                      <Globe size={11} className="shrink-0" />
                      <span>Preview</span>
                    </button>
                  )}

                  {onStopServer && (
                    <button
                      type="button"
                      title="Stop server process"
                      onClick={() => onStopServer(server.pid)}
                      className="flex items-center gap-1 h-[26px] px-2 rounded-full hover:bg-rose-500/20 active:scale-95 text-white/50 hover:text-rose-200 text-[11px] font-medium font-['Geist'] transition-all cursor-pointer"
                    >
                      <Square size={10} className="shrink-0 fill-current" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </ScrollArea>
      )}
    </div>
  );
};

export default AgentServersView;
