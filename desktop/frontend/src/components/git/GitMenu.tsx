import React, { useEffect, useRef, useState } from 'react';

export interface GitMenuProps {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode;
  onOpen?: () => void;
  width?: number;
  align?: 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}

export const GitMenu: React.FC<GitMenuProps> = ({
  trigger,
  onOpen,
  width = 260,
  align = 'left',
  children,
}) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const toggle = () => {
    setOpen((value) => {
      if (!value) onOpen?.();
      return !value;
    });
  };

  return (
    <div ref={root} className="relative">
      {trigger(open, toggle)}
      {open && (
        <div
          style={{ width }}
          className={`absolute top-[calc(100%+6px)] z-50 rounded-xl bg-[#121418]/97 border border-white/[0.09] shadow-[0_18px_48px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

export default GitMenu;
