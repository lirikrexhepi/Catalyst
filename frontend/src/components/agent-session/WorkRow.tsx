import React, { useState } from 'react';
import { TextShimmer } from './TextShimmer';

export function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div className="overflow-hidden min-w-0">{children}</div>
    </div>
  );
}

export function Chevron({ open, direction = 'right' }: { open: boolean; direction?: 'right' | 'down' }) {
  const rotation = direction === 'down' ? (open ? 'rotate-180' : 'rotate-0') : open ? 'rotate-90' : 'rotate-0';
  return (
    <span
      className={`material-symbols-outlined text-[14px] leading-none text-current/35 group-hover/work:text-current/70 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 ${rotation}`}
    >
      {direction === 'down' ? 'expand_more' : 'chevron_right'}
    </span>
  );
}

export interface WorkRowProps {
  icon?: string;
  iconNode?: React.ReactNode;
  label: string;
  target?: string;
  meta?: React.ReactNode;
  running?: boolean;
  error?: boolean;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  direction?: 'right' | 'down';
}

function WorkRowImpl({
  icon,
  iconNode,
  label,
  target,
  meta,
  running = false,
  error = false,
  children,
  defaultOpen = false,
  direction = 'right',
}: WorkRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = Boolean(children);
  const tone = error ? 'text-rose-400/90' : 'text-current/55';
  const text = target ? `${label} ${target}` : label;

  return (
    <div className="flex flex-col min-w-0 font-['Geist']">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((value) => !value)}
        className={`group/work flex items-center gap-2 min-w-0 max-w-full self-start py-[3px] text-left text-[12.5px] tracking-tight leading-[18px] ${
          expandable ? 'cursor-pointer' : 'cursor-default'
        } ${tone} ${expandable ? 'hover:text-current/85' : ''} transition-colors duration-150`}
      >
        <span className="w-[15px] h-[18px] flex items-center justify-center shrink-0">
          {iconNode ?? (
            <span className="material-symbols-outlined text-[14px] leading-none">{error ? 'error' : icon || 'build'}</span>
          )}
        </span>
        {running ? (
          <TextShimmer duration={1.6} className="truncate min-w-0">
            {text}
          </TextShimmer>
        ) : (
          <span className="truncate min-w-0">
            <span>{label}</span>
            {target && <span className="text-current/40"> {target}</span>}
          </span>
        )}
        {meta}
        {expandable && <Chevron open={open} direction={direction} />}
      </button>
      {expandable && (
        <Collapse open={open}>
          <div className="pl-[23px] pt-1 pb-1.5">{children}</div>
        </Collapse>
      )}
    </div>
  );
}

export const WorkRow = React.memo(WorkRowImpl);

export function OutputPanel({ text, prefix }: { text: string; prefix?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = (event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(prefix ? `${prefix}\n${text}` : text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="relative group/out rounded-[10px] bg-current/[0.045] px-3 py-2 max-w-full">
      <button
        type="button"
        onClick={copy}
        title="Copy"
        className="absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-current/45 hover:text-current hover:bg-current/[0.08] opacity-0 group-hover/out:opacity-100 transition-all duration-150 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[13px] leading-none">{copied ? 'check' : 'content_copy'}</span>
      </button>
      <pre className="m-0 pr-6 max-h-[240px] overflow-auto custom-scrollbar whitespace-pre-wrap break-all font-['Geist_Mono',monospace] text-[11px] leading-[1.6] text-current/70 select-text">
        {prefix && <span className="text-current/90">{prefix}{text ? '\n' : ''}</span>}
        {text}
      </pre>
    </div>
  );
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
