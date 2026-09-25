import React from 'react';
import { ContextUsage, formatTokens } from './contextUsage';

export const ContextRing: React.FC<{ usage?: ContextUsage; isLight?: boolean }> = ({ usage, isLight = false }) => {
  if (!usage || usage.tokens <= 0) return null;
  const ratio = usage.window ? Math.min(1, usage.tokens / usage.window) : undefined;
  const percent = ratio !== undefined ? Math.round(ratio * 100) : undefined;
  const size = 14;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const tone =
    ratio === undefined
      ? isLight ? 'text-black/45' : 'text-white/45'
      : ratio >= 0.9
        ? 'text-red-400'
        : ratio >= 0.75
          ? 'text-amber-300'
          : isLight ? 'text-black/55' : 'text-white/55';
  const title = usage.window
    ? `${usage.tokens.toLocaleString()} of ${usage.window.toLocaleString()} context tokens used`
    : `${usage.tokens.toLocaleString()} context tokens used`;

  return (
    <span title={title} className={`inline-flex items-center gap-1 shrink-0 text-[10.5px] font-medium font-['Geist'] tabular-nums ${tone}`}>
      {ratio !== undefined && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (ratio ?? 0))}
            style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
      )}
      <span>{percent !== undefined ? `${percent}%` : formatTokens(usage.tokens)}</span>
    </span>
  );
};
