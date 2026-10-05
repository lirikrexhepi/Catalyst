import React, { useEffect, useRef } from 'react';
import { slashcmd } from '../../../wailsjs/go/models';

export interface SlashMenuProps {
  commands: slashcmd.Command[];
  selected: number;
  isLight: boolean;
  onPick: (command: slashcmd.Command) => void;
  onHover: (index: number) => void;
}

const KIND_LABEL: Record<string, string> = { builtin: 'Built in', custom: 'Custom', skill: 'Skill' };

export const SlashMenu: React.FC<SlashMenuProps> = ({ commands, selected, isLight, onPick, onHover }) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div
      className={`w-[440px] max-w-[calc(100vw-48px)] rounded-[16px] p-1.5 backdrop-blur-2xl border shadow-2xl ${
        isLight
          ? 'bg-white/95 border-black/10 text-[#030303]'
          : 'bg-[#0e0e10]/95 border-white/10 text-white'
      }`}
      style={{ boxShadow: '0 24px 56px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={listRef} className="max-h-[280px] overflow-y-auto custom-scrollbar flex flex-col">
        {commands.map((command, index) => {
          const active = index === selected;
          const previous = commands[index - 1];
          const heading = !previous || previous.kind !== command.kind;
          return (
            <React.Fragment key={`${command.kind}-${command.name}`}>
              {heading && (
                <span className={`px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider ${isLight ? 'text-black/35' : 'text-white/35'}`}>
                  {KIND_LABEL[command.kind] ?? command.kind}
                </span>
              )}
              <button
                type="button"
                data-active={active}
                onMouseEnter={() => onHover(index)}
                onClick={() => onPick(command)}
                className={`flex items-baseline gap-2.5 px-2.5 py-[7px] rounded-[10px] text-left cursor-pointer transition-colors duration-100 ${
                  active ? (isLight ? 'bg-black/[0.06]' : 'bg-white/[0.09]') : ''
                }`}
              >
                <span className="text-[12.5px] font-medium font-(family-name:--app-font) tracking-tight shrink-0">/{command.name}</span>
                <span className={`text-[11.5px] font-(family-name:--app-font) tracking-tight truncate ${isLight ? 'text-black/45' : 'text-white/45'}`}>
                  {command.description}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
