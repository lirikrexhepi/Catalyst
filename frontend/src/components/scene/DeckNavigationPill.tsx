import { ChevronLeft, ChevronRight, LayoutGrid, Layers, Sparkles } from 'lucide-react';
import { useTheme } from '../../themes';

export interface DeckNavigationPillProps {
  currentIndex: number;
  totalCount: number;
  viewMode: 'deck' | 'grid' | 'orchestrator';
  onPrev: () => void;
  onNext: () => void;
  onToggleViewMode: () => void;
  onAscend?: () => void;
  onDescend?: () => void;
  canPrev: boolean;
  canNext: boolean;
  className?: string;
}

export const DeckNavigationPill: React.FC<DeckNavigationPillProps> = ({
  currentIndex,
  totalCount,
  viewMode,
  onPrev,
  onNext,
  onToggleViewMode,
  onAscend,
  onDescend,
  canPrev,
  canNext,
  className = '',
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  if (totalCount < 1) return null;
  if (viewMode === 'orchestrator') return null;

  return (
    <div className={`flex items-center pointer-events-auto select-none transition-all duration-300 ${className}`}>
      {/* Deck Mode Slide Arrows (Smoothly expands/collapses when toggling grid/deck) */}
      {totalCount > 1 && (
        <div
          className={`h-[32px] flex items-center overflow-hidden transition-[max-width,opacity,margin,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            viewMode === 'deck'
              ? 'max-w-[120px] opacity-100 mr-2 scale-100 pointer-events-auto'
              : 'max-w-0 opacity-0 mr-0 scale-95 pointer-events-none'
          }`}
        >
          <div className={`w-[108px] h-[32px] shrink-0 flex items-center justify-between px-2 backdrop-blur-md rounded-full border shadow-lg transition-colors ${
            isLight
              ? 'bg-black/[0.04] hover:bg-black/[0.08] border-black/[0.08]'
              : 'bg-black/40 hover:bg-black/55 border-white/15'
          }`}>
            <button
              type="button"
              title="Previous agent (Ctrl + Left)"
              disabled={!canPrev}
              onClick={onPrev}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 ${
                canPrev
                  ? (isLight
                      ? 'hover:bg-black/[0.08] text-[#030303] active:scale-90 cursor-pointer'
                      : 'hover:bg-white/20 text-white active:scale-90 cursor-pointer')
                  : (isLight ? 'text-black/20 cursor-default' : 'text-white/20 cursor-default')
              }`}
            >
              <ChevronLeft size={14} />
            </button>

            <span className={`text-[11px] font-medium font-['Geist'] tabular-nums select-none ${
              isLight ? 'text-[#030303]/70' : 'text-white/70'
            }`}>
              {currentIndex + 1} / {totalCount}
            </span>

            <button
              type="button"
              title="Next agent (Ctrl + Right)"
              disabled={!canNext}
              onClick={onNext}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-150 ${
                canNext
                  ? (isLight
                      ? 'hover:bg-black/[0.08] text-[#030303] active:scale-90 cursor-pointer'
                      : 'hover:bg-white/20 text-white active:scale-90 cursor-pointer')
                  : (isLight ? 'text-black/20 cursor-default' : 'text-white/20 cursor-default')
              }`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Controls: Clean, minimal icon buttons */}
      {viewMode === 'grid' ? (
        <div className="flex items-center gap-1.5">
          {/* Descend to Deck */}
          <button
            type="button"
            onClick={onDescend || onToggleViewMode}
            title="Focus agent (Ctrl + ↓)"
            className={`w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all duration-150 border cursor-pointer active:scale-90 shadow-lg backdrop-blur-md ${
              isLight
                ? 'bg-black/[0.04] hover:bg-black/[0.09] border-black/[0.08] text-[#030303]/80 hover:text-[#030303]'
                : 'bg-black/40 hover:bg-black/60 border-white/15 text-white/80 hover:text-white'
            }`}
          >
            <Layers size={14} className="shrink-0" />
          </button>

          {/* Ascend to Orchestrator */}
          <button
            type="button"
            onClick={onAscend || onToggleViewMode}
            title="Orchestrator (Ctrl + ↑)"
            className={`w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all duration-150 border cursor-pointer active:scale-90 shadow-lg backdrop-blur-md ${
              isLight
                ? 'bg-black/[0.04] hover:bg-black/[0.09] border-black/[0.08] text-[#030303]/80 hover:text-[#030303]'
                : 'bg-black/40 hover:bg-black/60 border-white/15 text-white/80 hover:text-white'
            }`}
          >
            <Sparkles size={14} className="shrink-0" />
          </button>
        </div>
      ) : (
        /* Deck Mode */
        <button
          type="button"
          onClick={onAscend || onToggleViewMode}
          title="Grid view (Ctrl + ↑)"
          className={`w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all duration-150 border cursor-pointer active:scale-90 shadow-lg backdrop-blur-md ${
            isLight
              ? 'bg-black/[0.04] hover:bg-black/[0.09] border-black/[0.08] text-[#030303]/80 hover:text-[#030303]'
              : 'bg-black/40 hover:bg-black/60 border-white/15 text-white/80 hover:text-white'
          }`}
        >
          <LayoutGrid size={14} className={`shrink-0 ${isLight ? 'text-[#030303]/80' : 'text-white/80'}`} />
        </button>
      )}
    </div>
  );
};

export default DeckNavigationPill;
