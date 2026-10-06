import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

const GUTTER = 20;
const RAIL_X = 4.5;
const SEGMENT_PAD = 7;

export const TEXT_DOT_Y = 10;
export const ROW_DOT_Y = 12;

export const TimelineContext = createContext(false);
export const TimelineAnimateContext = createContext(false);

export const useInTimeline = () => useContext(TimelineContext);

type DotTone = 'text' | 'row' | 'error' | 'running';

const ELBOW_HEIGHT = 13;
const ELBOW_RADIUS = 9;

const ELBOW_COLOR: Record<DotTone, string> = {
  text: 'text-current/[0.2]',
  row: 'text-current/[0.2]',
  error: 'text-rose-400/70',
  running: 'text-current/[0.2]',
};

export function TimelineDot({ y, tone = 'row' }: { y: number; tone?: DotTone }) {
  const width = GUTTER - RAIL_X - 3;
  const animate = useContext(TimelineAnimateContext);
  return (
    <svg
      aria-hidden
      data-tl-dot=""
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
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        className={animate ? 'timeline-elbow-draw' : undefined}
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
  const ref = useRef<HTMLDivElement>(null);
  const animate = useContext(TimelineAnimateContext);
  const [lastDotY, setLastDotY] = useState<number | null>(null);
  const anchor = SEGMENT_PAD + dotY;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || connectDown) return;
    const measure = () => {
      const dots = el.querySelectorAll('[data-tl-dot]');
      const last = dots[dots.length - 1] as SVGElement | undefined;
      if (!last) return setLastDotY(null);
      const box = el.getBoundingClientRect();
      const scale = box.height && el.offsetHeight ? box.height / el.offsetHeight : 1;
      const dot = last.getBoundingClientRect();
      const next = Math.round((dot.bottom - box.top) / scale) - 1;
      setLastDotY((prev) => (prev === next ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [connectDown]);

  const railEnd = connectDown ? null : lastDotY ?? anchor;
  return (
    <div ref={ref} className={`relative ${className}`} style={{ paddingLeft: GUTTER, paddingTop: SEGMENT_PAD, paddingBottom: SEGMENT_PAD }}>
      <span
        aria-hidden
        className={`absolute w-[2px] rounded-full bg-current/[0.2] pointer-events-none ${animate ? 'timeline-rail-draw' : ''}`}
        style={{
          left: RAIL_X - 1,
          top: connectUp ? 0 : anchor - ELBOW_RADIUS,
          bottom: railEnd === null ? 0 : `calc(100% - ${railEnd - ELBOW_RADIUS}px)`,
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
