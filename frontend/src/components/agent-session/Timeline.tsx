import React, { createContext, useContext } from 'react';

const GUTTER = 20;
const RAIL_X = 4.5;
const SEGMENT_PAD = 7;

export const TEXT_DOT_Y = 10;
export const ROW_DOT_Y = 12;

export const TimelineContext = createContext(false);

export const useInTimeline = () => useContext(TimelineContext);

type DotTone = 'text' | 'row' | 'error' | 'running';

const ELBOW_HEIGHT = 13;
const ELBOW_RADIUS = 9;

const ELBOW_COLOR: Record<DotTone, string> = {
  text: 'text-current/[0.22]',
  row: 'text-current/[0.22]',
  error: 'text-rose-400/70',
  running: 'text-emerald-400/70',
};

export function TimelineDot({ y, tone = 'row' }: { y: number; tone?: DotTone }) {
  const width = GUTTER - RAIL_X - 3;
  return (
    <svg
      aria-hidden
      width={width}
      height={ELBOW_HEIGHT}
      viewBox={`0 0 ${width} ${ELBOW_HEIGHT}`}
      fill="none"
      className={`absolute pointer-events-none overflow-visible ${ELBOW_COLOR[tone]}`}
      style={{ top: y - ELBOW_HEIGHT, left: -(GUTTER - RAIL_X) }}
    >
      <path
        d={`M0 ${ELBOW_HEIGHT - ELBOW_RADIUS} C0 ${ELBOW_HEIGHT - 3} 3 ${ELBOW_HEIGHT - 0.5} ${ELBOW_RADIUS} ${ELBOW_HEIGHT - 0.5} H${width}`}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TimelineNode({
  y = TEXT_DOT_Y,
  tone = 'text',
  children,
}: {
  y?: number;
  tone?: DotTone;
  children: React.ReactNode;
}) {
  const inTimeline = useInTimeline();
  if (!inTimeline) return <>{children}</>;
  return (
    <div className="relative min-w-0">
      <TimelineDot y={y} tone={tone} />
      {children}
    </div>
  );
}

export function TimelineSegment({
  connectUp,
  connectDown,
  dotY,
  className = '',
  children,
}: {
  className?: string;
  connectUp: boolean;
  connectDown: boolean;
  dotY: number;
  children: React.ReactNode;
}) {
  const anchor = SEGMENT_PAD + dotY;
  return (
    <div className={`relative ${className}`} style={{ paddingLeft: GUTTER, paddingTop: SEGMENT_PAD, paddingBottom: SEGMENT_PAD }}>
      <span
        aria-hidden
        className="absolute w-px bg-current/[0.22] pointer-events-none"
        style={{
          left: RAIL_X - 0.5,
          top: connectUp ? -1 : anchor - ELBOW_RADIUS,
          bottom: connectDown ? -1 : `calc(100% - ${anchor - ELBOW_RADIUS}px)`,
        }}
      />
      <TimelineContext.Provider value>{children}</TimelineContext.Provider>
    </div>
  );
}

export function PlainSegment({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={className} style={{ paddingTop: SEGMENT_PAD, paddingBottom: SEGMENT_PAD }}>
      {children}
    </div>
  );
}
