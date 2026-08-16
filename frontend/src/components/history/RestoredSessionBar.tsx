import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { RestoredSession } from './useHistory';

export interface RestoredSessionBarProps {
  session: RestoredSession;
  isResuming: boolean;
  onResume: () => void;
  onClose: () => void;
  className?: string;
}

/**
 * Header for a reopened session.
 *
 * Its job is to be honest about state: a replayed transcript and a live agent
 * look the same on screen, and acting on the wrong assumption — typing into a
 * window whose CLI is gone — is the mistake this prevents.
 */
export const RestoredSessionBar: React.FC<RestoredSessionBarProps> = ({
  session,
  isResuming,
  onResume,
  onClose,
  className = '',
}) => {
  const liveCount = session.tasks.filter((task) => task.isLive).length;
  const total = session.tasks.length;
  const isReplay = liveCount === 0;
  const notes = session.tasks.filter((task) => task.note);

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={16}
      bezelWidth={16}
      glassThickness={22}
      refractionScale={0.8}
      blur={0.4}
      specularOpacity={0.7}
      specularSaturation={6}
      lightAngle={-45}
      tint="rgba(0, 0, 0, 0.24)"
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.16)"
      frost={14}
      frostSaturation={170}
      className={`px-3.5 py-2.5 flex flex-col gap-2 max-w-[720px] ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isReplay ? 'bg-white/30' : 'bg-white status-dot-working'
          }`}
        />

        <div className="min-w-0 flex flex-col">
          <span className="text-[12.5px] font-medium font-['Geist'] text-white/95 tracking-tight truncate">
            {session.title}
          </span>
          <span className="text-[10.5px] font-['Geist'] text-white/40 truncate">
            {isReplay
              ? `Replay · ${total} agent${total === 1 ? '' : 's'} · read-only`
              : `${liveCount} of ${total} agent${total === 1 ? '' : 's'} live`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {isReplay && (
            <button
              type="button"
              onClick={onResume}
              disabled={isResuming}
              className="h-[26px] px-3 rounded-[8px] bg-white/90 hover:bg-white active:scale-95 disabled:opacity-50 disabled:cursor-default text-[11.5px] font-semibold font-['Geist'] text-black tracking-tight transition-all duration-150 cursor-pointer"
            >
              {isResuming ? 'Resuming…' : 'Resume session'}
            </button>
          )}
          <button
            type="button"
            title="Close session"
            onClick={onClose}
            className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white/45 hover:text-white/90 hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">close</span>
          </button>
        </div>
      </div>

      {/* An agent that restarted fresh has no memory of its work, which the user
          must know before trusting a follow-up message. */}
      {notes.length > 0 && (
        <div className="flex flex-col gap-1 pl-4">
          {notes.map((task) => (
            <span
              key={task.threadId}
              className="text-[10.5px] font-['Geist'] text-amber-200/70 leading-relaxed"
            >
              {task.title}: {task.note}
            </span>
          ))}
        </div>
      )}
    </LiquidGlass>
  );
};

export default RestoredSessionBar;
