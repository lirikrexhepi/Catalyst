import React from 'react';

export interface NoticeDividerProps {
  label: string;
  icon?: string;
  className?: string;
}

/**
 * Centered rule marking a change in the conversation, such as switching model.
 * The rules are flex children rather than a background line so the label always
 * sits flush between them at any width.
 */
const NoticeDividerImpl: React.FC<NoticeDividerProps> = ({ label, icon, className = '' }) => (
  <div className={`flex items-center gap-2.5 py-0.5 select-none ${className}`}>
    <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />

    <span className="inline-flex items-center gap-1.5 shrink-0">
      {icon && (
        <img src={icon} alt="" className="w-3.5 h-3.5 object-contain" draggable={false} />
      )}
      <span className="text-[11px] font-medium font-['Geist'] text-white/45 tracking-tight whitespace-nowrap">
        {label}
      </span>
    </span>

    <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
  </div>
);

export const NoticeDivider = React.memo(NoticeDividerImpl);
NoticeDivider.displayName = 'NoticeDivider';

export default NoticeDivider;
