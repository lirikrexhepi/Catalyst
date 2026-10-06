import React from 'react';
import { OutputPanel, WorkRow } from './WorkRow';

export interface BashToolProps {
  command: string;
  output?: string;
  summary?: string;
  status?: 'running' | 'completed' | 'error';
  exitCode?: number;
  className?: string;
  defaultExpanded?: boolean;
}

const BashToolImpl: React.FC<BashToolProps> = ({
  command,
  output = '',
  summary,
  status = 'completed',
  exitCode,
  defaultExpanded = false,
}) => {
  const firstLine = (summary || command.split('\n').find((line) => line.trim()) || command || 'command').trim();
  const meta =
    status === 'error' && exitCode !== undefined ? (
      <span className="text-[11px] text-rose-400/80 tabular-nums shrink-0">exit {exitCode}</span>
    ) : undefined;

  return (
    <WorkRow
      icon="terminal"
      label={status === 'running' ? 'Running' : 'Ran'}
      target={firstLine}
      running={status === 'running'}
      error={status === 'error'}
      meta={meta}
      defaultOpen={defaultExpanded}
    >
      <OutputPanel prefix={`$ ${command}`} text={output.trimEnd()} />
    </WorkRow>
  );
};

export const BashTool = React.memo(BashToolImpl);
BashTool.displayName = 'BashTool';

export default BashTool;
