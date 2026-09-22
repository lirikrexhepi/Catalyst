import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ScrollArea } from './ScrollArea';
import { useTheme } from '../../themes';

export interface CleanDropdownOption {
  value: string;
  label: string;
}

export interface CleanDropdownProps {
  value: string;
  options: CleanDropdownOption[];
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
}

export const CleanDropdown: React.FC<CleanDropdownProps> = ({
  value,
  options,
  disabled = false,
  placeholder = 'Select…',
  onChange,
  className = '',
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const isGlass = currentTheme.id === 'glass' || currentTheme.id === 'refractive-glass';

  const [isOpen, setIsOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    width: number;
    openUpward: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label || (value === '' ? 'CLI default' : placeholder);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuMaxHeight = 192;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuMaxHeight + 16 && rect.top > menuMaxHeight + 16;
    const right = Math.max(window.innerWidth - rect.right, 8);
    const width = Math.max(rect.width, 185);

    if (openUpward) {
      setMenuCoords({
        bottom: window.innerHeight - rect.top + 4,
        right,
        width,
        openUpward: true,
      });
    } else {
      setMenuCoords({
        top: rect.bottom + 4,
        right,
        width,
        openUpward: false,
      });
    }
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative shrink-0 select-none ${className}`}>
      {/* Trigger Pill */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full h-[26px] px-2.5 rounded-[8px] flex items-center justify-between gap-1.5 border transition-all duration-150 cursor-pointer text-left ${
          disabled
            ? isLight
              ? 'opacity-35 cursor-not-allowed bg-black/[0.03] border-black/[0.05] text-black/40'
              : 'opacity-35 cursor-not-allowed bg-white/[0.03] border-white/[0.04] text-white/40'
            : isOpen
              ? isLight
                ? 'bg-black/10 border-black/15 text-black shadow-sm'
                : 'bg-white/[0.14] border-white/[0.18] text-white shadow-sm'
              : isLight
                ? 'bg-black/[0.04] hover:bg-black/[0.08] active:scale-95 border-black/[0.08] text-black/85 hover:text-black'
                : 'bg-white/[0.06] hover:bg-white/[0.10] active:scale-95 border-white/[0.08] text-white/85 hover:text-white'
        }`}
      >
        <span className="text-[11.5px] font-medium font-['Geist'] tracking-tight truncate flex-1">
          {displayLabel}
        </span>
        <span
          className={`material-symbols-rounded text-[14px] leading-none transition-transform duration-200 shrink-0 ${
            isOpen
              ? isLight ? 'rotate-180 text-black' : 'rotate-180 text-white'
              : isLight ? 'text-black/45' : 'text-white/40'
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Popover Menu Portaled to document.body so it is never clipped by sidebar/scroll containers */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && menuCoords && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.96, y: menuCoords.openUpward ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  y: menuCoords.openUpward ? 3 : -3,
                  transition: { duration: 0.1, ease: 'easeIn' },
                }}
                transition={{
                  type: 'spring',
                  stiffness: 440,
                  damping: 30,
                  mass: 0.8,
                }}
                style={{
                  position: 'fixed',
                  top: menuCoords.top !== undefined ? `${menuCoords.top}px` : undefined,
                  bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : undefined,
                  right: `${menuCoords.right}px`,
                  minWidth: `${menuCoords.width}px`,
                  maxWidth: '260px',
                  zIndex: 99999,
                  transformOrigin: menuCoords.openUpward ? 'bottom right' : 'top right',
                  backgroundColor: isLight
                    ? 'rgba(255, 255, 255, 0.98)'
                    : isGlass
                    ? 'rgba(18, 22, 36, 0.92)'
                    : '#161618',
                  borderColor: isLight
                    ? 'rgba(0, 0, 0, 0.12)'
                    : isGlass
                    ? 'rgba(255, 255, 255, 0.22)'
                    : 'rgba(255, 255, 255, 0.12)',
                  boxShadow: isLight
                    ? '0 16px 36px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.8)'
                    : '0 16px 36px rgba(0, 0, 0, 0.85), 0 4px 12px rgba(0, 0, 0, 0.5)',
                  backdropFilter: isGlass ? 'blur(20px)' : undefined,
                  WebkitBackdropFilter: isGlass ? 'blur(20px)' : undefined,
                }}
                className="p-1 rounded-[12px] border overflow-hidden select-none"
              >
                <ScrollArea maxHeight={180} className="flex flex-col gap-0.5 pr-0.5">
                  {options.map((option) => {
                    const isSelected = option.value === value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value);
                          setIsOpen(false);
                        }}
                        className={`w-full h-[28px] px-2 rounded-[7px] flex items-center justify-between text-left transition-colors cursor-pointer text-[11.5px] font-['Geist'] ${
                          isSelected
                            ? isLight
                              ? 'bg-black/10 text-black font-medium shadow-[inset_0_1px_0_rgba(0,0,0,0.05)]'
                              : 'bg-white/[0.14] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                            : isLight
                              ? 'text-black/75 hover:text-black hover:bg-black/[0.05]'
                              : 'text-white/75 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="truncate flex-1 tracking-tight mr-1">
                          {option.label}
                        </span>
                        {isSelected && (
                          <span
                            className={`material-symbols-rounded text-[13px] leading-none shrink-0 ${
                              isLight ? 'text-black' : 'text-white'
                            }`}
                          >
                            check
                          </span>
                        )}
                      </button>
                    );
                  })}
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
};
