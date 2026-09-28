import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FlaskConical } from 'lucide-react';
import { ListSkills } from '../../../wailsjs/go/main/App';
import { skills as skillModels } from '../../../wailsjs/go/models';

interface SkillTestPickerProps {
  cwd: string;
  selected: string[];
  onChange: (next: string[]) => void;
  isLight: boolean;
}

export const SkillTestPicker: React.FC<SkillTestPickerProps> = ({ cwd, selected, onChange, isLight }) => {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<skillModels.Info[] | null>(null);
  const [anchor, setAnchor] = useState<{ bottom: number; right: number } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const place = () => {
      const r = trigger.current!.getBoundingClientRect();
      setAnchor({ bottom: window.innerHeight - r.top + 10, right: Math.max(12, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setAvailable(null);
    ListSkills(cwd)
      .then((list) => alive && setAvailable(list ?? []))
      .catch(() => alive && setAvailable([]));
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (trigger.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, cwd]);

  const toggle = (name: string) => onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name]);
  const active = selected.length > 0;
  const muted = isLight ? 'text-black/45' : 'text-white/45';

  const triggerTone = active
    ? 'bg-[#007AFF]/15 text-[#0A84FF] hover:bg-[#007AFF]/25'
    : isLight
      ? 'text-black/45 hover:text-[#030303] hover:bg-black/[0.06]'
      : 'text-white/40 hover:text-white hover:bg-white/[0.08]';

  return (
    <>
      <button
        ref={trigger}
        type="button"
        title={active ? `Skill test: ${selected.join(', ')}` : 'Skill test'}
        aria-label="Skill test"
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`h-[38px] min-w-[38px] px-2 rounded-full flex items-center justify-center gap-1 shrink-0 transition-all duration-150 active:scale-95 cursor-pointer ${triggerTone}`}
      >
        <FlaskConical size={18} strokeWidth={1.75} />
        {active && <span className="text-[12px] font-medium tabular-nums">{selected.length}</span>}
      </button>

      {open && anchor &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Skill test"
            style={{ position: 'fixed', bottom: anchor.bottom, right: anchor.right, zIndex: 1000 }}
            className={`w-[300px] rounded-[22px] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] font-['Geist'] ${
              isLight ? 'bg-white border border-black/[0.08] text-[#030303]' : 'bg-[#1f1f1f] border border-white/[0.08] text-white'
            }`}
          >
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-[13px] font-medium">Skill test</span>
              {active && (
                <button type="button" onClick={() => onChange([])} className={`text-[12px] ${isLight ? 'text-black/45 hover:text-black' : 'text-white/45 hover:text-white'}`}>
                  Clear
                </button>
              )}
            </div>
            <p className={`px-3 pb-2 text-[12px] leading-[1.4] ${muted}`}>One agent with these skills, one with none.</p>
            <div className="max-h-[280px] overflow-y-auto">
              {available === null && <div className={`px-3 py-4 text-[12px] ${muted}`}>Loading…</div>}
              {available?.length === 0 && <div className={`px-3 py-4 text-[12px] ${muted}`}>No skills found.</div>}
              {available?.map((skill) => {
                const on = selected.includes(skill.name);
                return (
                  <button
                    key={skill.name}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(skill.name)}
                    title={skill.description}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-[14px] text-left transition-colors duration-150 ${isLight ? 'hover:bg-black/[0.04]' : 'hover:bg-white/[0.06]'}`}
                  >
                    <span
                      className={`w-[18px] h-[18px] rounded-[6px] flex items-center justify-center shrink-0 ${
                        on ? 'bg-[#007AFF] text-white' : isLight ? 'border border-black/20' : 'border border-white/25'
                      }`}
                    >
                      {on && <Check size={13} strokeWidth={2.5} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] truncate">{skill.name}</span>
                      {skill.source === 'project' && <span className={`block text-[11px] ${muted}`}>project</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
