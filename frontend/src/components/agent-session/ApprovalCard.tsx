import React, { useState } from 'react';
import { ApprovalOptionItem } from './types';

export interface ApprovalCardProps {
  requestID: string;
  title: string;
  detail?: string;
  options?: ApprovalOptionItem[];
  status?: 'pending' | 'resolved' | 'denied';
  decision?: string;
  onRespond?: (decision: string) => void;
  className?: string;
}

/**
 * ApprovalCard Component
 * Minimalist, modern frosted glass card for interactive permission requests.
 * Conforms to the Emil Kowalski / Apple design engineering philosophy:
 * - Direct visual hierarchy
 * - Tactile active states (active:scale-95)
 * - Restrained amber accenting for security awareness
 */
export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  requestID,
  title = 'Permission Request',
  detail,
  options = [
    { id: 'once', name: 'Allow once', kind: 'allowOnce' },
    { id: 'always', name: 'Always allow', kind: 'allowAlways' },
    { id: 'reject', name: 'Deny', kind: 'deny' },
  ],
  status = 'pending',
  decision,
  onRespond,
  className = '',
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<string | null>(decision ?? null);

  const isResolved = status === 'resolved' || status === 'denied' || selectedDecision !== null;

  const handleSelect = (decisionId: string) => {
    if (isResolved || submitting) return;
    setSubmitting(true);
    setSelectedDecision(decisionId);
    onRespond?.(decisionId);
  };

  const getDecisionLabel = (dec: string) => {
    if (dec === 'always' || dec === 'allowAlways') return 'Allowed always';
    if (dec === 'once' || dec === 'allowOnce') return 'Allowed once';
    if (dec === 'reject' || dec === 'deny' || dec === 'cancel') return 'Denied';
    return dec;
  };

  const isDenied =
    status === 'denied' ||
    selectedDecision === 'reject' ||
    selectedDecision === 'deny' ||
    selectedDecision === 'cancel';

  return (
    <div
      className={`rounded-xl bg-current/[0.05] p-3.5 text-current max-w-full font-['Geist'] select-none flex flex-col gap-2.5 transition-all duration-200 border-0 shadow-none ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-400/15 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[13px] text-amber-300 leading-none">
              shield
            </span>
          </div>
          <span className="text-[12px] font-semibold text-current/95 tracking-tight">
            {title}
          </span>
        </div>

        {isResolved ? (
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              isDenied
                ? 'bg-rose-500/15 text-rose-200'
                : 'bg-emerald-500/15 text-emerald-200'
            }`}
          >
            {getDecisionLabel(selectedDecision || decision || 'resolved')}
          </span>
        ) : (
          <span className="text-[10px] font-medium text-amber-300/80 px-2 py-0.5 rounded-full bg-amber-400/10 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Action Required
          </span>
        )}
      </div>

      {detail && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-current/50 tracking-tight">
            Target resource or directory:
          </span>
          <div className="px-2.5 py-1.5 rounded-lg bg-black/30 text-current/85 font-mono text-[11px] select-text break-all">
            {detail}
          </div>
        </div>
      )}

      {!isResolved && (
        <div className="flex items-center gap-2 pt-1">
          {options.map((opt) => {
            const isAlways = opt.id === 'always' || opt.kind === 'allowAlways';
            const isDeny = opt.id === 'reject' || opt.id === 'deny' || opt.kind === 'deny';

            let btnClass =
              'px-3 py-1.5 rounded-lg text-[11.5px] font-medium tracking-tight transition-all duration-150 active:scale-95 cursor-pointer';

            if (isAlways) {
              btnClass +=
                ' bg-white/90 text-black hover:bg-white';
            } else if (isDeny) {
              btnClass +=
                ' bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 ml-auto';
            } else {
              btnClass +=
                ' bg-current/[0.08] hover:bg-current/[0.12] text-current';
            }

            return (
              <button
                key={opt.id}
                type="button"
                disabled={submitting}
                onClick={() => handleSelect(opt.kind || opt.id)}
                className={btnClass}
              >
                {opt.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovalCard;
