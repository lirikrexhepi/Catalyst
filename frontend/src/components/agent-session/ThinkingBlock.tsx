import { MaterialIcon } from '../common/icons';
import React, { useEffect, useRef, useState } from 'react';
import { WorkRow, formatElapsed } from './WorkRow';

export interface ThinkingBlockProps {
  isThinking?: boolean;
  thoughtText?: string;
  durationSeconds?: number;
  defaultExpanded?: boolean;
  className?: string;
}

const ThinkingBlockImpl: React.FC<ThinkingBlockProps> = ({
  isThinking = false,
  thoughtText = '',
  durationSeconds = 0,
  defaultExpanded = false,
}) => {
  const startedAt = useRef(0);
  const [settled, setSettled] = useState<number | null>(null);

  useEffect(() => {
    if (isThinking) {
      startedAt.current = Date.now();
      setSettled(null);
      return;
    }
    if (startedAt.current > 0) {
      setSettled((Date.now() - startedAt.current) / 1000);
      startedAt.current = 0;
    }
  }, [isThinking]);

  const seconds = durationSeconds > 0 ? durationSeconds : settled;
  const label = isThinking ? 'Thinking' : seconds && seconds >= 1 ? `Thought for ${formatElapsed(seconds)}` : 'Thought';
  const text = thoughtText.trim();

  return (
    <WorkRow
      label={label}
      running={isThinking}
      defaultOpen={defaultExpanded}
    >
      {text ? (
        <div className="border-l border-current/[0.12] pl-3 text-[12px] leading-[1.65] tracking-tight text-current/50 whitespace-pre-wrap select-text max-h-[320px] overflow-y-auto custom-scrollbar">
          {text}
        </div>
      ) : undefined}
    </WorkRow>
  );
};

export const ThinkingBlock = React.memo(ThinkingBlockImpl);
ThinkingBlock.displayName = 'ThinkingBlock';

export default ThinkingBlock;
