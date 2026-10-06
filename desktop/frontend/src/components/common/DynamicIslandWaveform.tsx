import React from 'react';

export interface DynamicIslandWaveformProps {
  className?: string;
}

/**
 * DynamicIslandWaveform
 * Clean monochrome Apple-style animated equalizer waveform.
 */
export const DynamicIslandWaveform: React.FC<DynamicIslandWaveformProps> = ({ className = '' }) => {
  return (
    <div
      className={`flex items-center gap-[2px] h-[16px] px-0.5 select-none pointer-events-none ${className}`}
      aria-label="Working indicator"
      title="Agent working"
    >
      <span className="w-[2px] rounded-full bg-white/60 anim-dynamic-wave-1 min-h-[3px]" />
      <span className="w-[2px] rounded-full bg-white/90 anim-dynamic-wave-2 min-h-[3px]" />
      <span className="w-[2px] rounded-full bg-white anim-dynamic-wave-3 min-h-[3px]" />
      <span className="w-[2px] rounded-full bg-white/90 anim-dynamic-wave-4 min-h-[3px]" />
      <span className="w-[2px] rounded-full bg-white/60 anim-dynamic-wave-5 min-h-[3px]" />
    </div>
  );
};

export default DynamicIslandWaveform;
