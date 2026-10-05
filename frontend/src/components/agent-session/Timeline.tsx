import React, { createContext, useContext } from 'react';

const GUTTER = 20;
const RAIL_X = 4.5;
const SEGMENT_PAD = 7;

export const TEXT_DOT_Y = 10;
export const ROW_DOT_Y = 12;

export const TimelineContext = createContext(false);

export const useInTimeline = () => useContext(TimelineContext);

type DotTone = 'text' | 'row' | 'error' | 'running';

const DOT_SIZE: Record<DotTone, number> = { text: 7, row: 5, error: 5, running: 5 };

const DOT_COLOR: Record<DotTone, string> = {
  text: 'bg-current/70',
  row: 'bg-current/30',
  error: 'bg-rose-400/90',
  running: 'bg-emerald-400/90 animate-pulse',
};

export function TimelineDot({ y, tone = 'row' }: { y: number; tone?: DotTone }) {
  const size = DOT_SIZE[tone];
  return (
    <span
      aria-hidden
      className={`absolute rounded-full pointer-events-none ${DOT_COLOR[tone]}`}
      style={{
        width: size,
        height: size,
        top: y - size / 2,
        left: -(GUTTER - RAIL_X + size / 2),
      }}
    />
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
  children,
}: {
  connectUp: boolean;
  connectDown: boolean;
  dotY: number;
  children: React.ReactNode;
}) {
  const anchor = SEGMENT_PAD + dotY;
  return (
    <div className="relative" style={{ paddingLeft: GUTTER, paddingTop: SEGMENT_PAD, paddingBottom: SEGMENT_PAD }}>
      <span
        aria-hidden
        className="absolute w-px bg-current/[0.14] pointer-events-none"
        style={{
          left: RAIL_X - 0.5,
          top: connectUp ? 0 : anchor,
          bottom: connectDown ? 0 : `calc(100% - ${anchor}px)`,
        }}
      />
      <TimelineContext.Provider value>{children}</TimelineContext.Provider>
    </div>
  );
}

export function PlainSegment({ children }: { children: React.ReactNode }) {
  return <div style={{ paddingTop: SEGMENT_PAD, paddingBottom: SEGMENT_PAD }}>{children}</div>;
}
