import React, { useState } from 'react';

export interface QuestionOption {
  key: string; // e.g. 'A', 'B', 'C'
  label: string;
  isCustomInput?: boolean;
}

export interface QuestionToolProps {
  questionNumber?: number;
  totalQuestions?: number;
  question: string;
  options?: QuestionOption[];
  onAnswer?: (selectedKey: string, customText?: string) => void;
  onSkip?: () => void;
  /** Identifier forwarded to the block-scoped callbacks so the parent can pass stable ones. */
  blockId?: string;
  onAnswerBlock?: (blockId: string, selectedKey: string, customText?: string) => void;
  onSkipBlock?: (blockId: string) => void;
  className?: string;
}

/**
 * QuestionTool Component
 * Interactive agent clarification question card with single choice, custom text, and skip/next controls.
 */
const QuestionToolImpl: React.FC<QuestionToolProps> = ({
  questionNumber = 1,
  totalQuestions = 2,
  question,
  options = [
    { key: 'A', label: 'Small scoped patch' },
    { key: 'B', label: 'Full refactor' },
    { key: 'C', label: 'Type your answer', isCustomInput: true },
  ],
  onAnswer,
  onSkip,
  blockId,
  onAnswerBlock,
  onSkipBlock,
  className = '',
}) => {
  const [selectedKey, setSelectedKey] = useState<string>('A');
  const [customText, setCustomText] = useState<string>('');

  const handleSelect = (key: string) => {
    setSelectedKey(key);
  };

  const handleNext = () => {
    const text = selectedKey === 'C' ? customText : undefined;
    onAnswer?.(selectedKey, text);
    if (blockId) onAnswerBlock?.(blockId, selectedKey, text);
  };

  const handleSkip = () => {
    onSkip?.();
    if (blockId) onSkipBlock?.(blockId);
  };

  return (
    <div
      className={`rounded-[14px] glass-card border border-white/25 p-3 text-white max-w-full shadow-md font-['Geist'] select-none flex flex-col gap-2.5 ${className}`}
      style={{
        boxShadow:
          '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
      }}
    >
      {/* Header with Step Indicator */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[15px] text-white/70">
            chat_bubble_outline
          </span>
          <span className="text-[12px] font-medium text-white/90">Question</span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-white/60">
          <span className="material-symbols-outlined text-[14px] cursor-pointer hover:text-white">
            keyboard_arrow_up
          </span>
          <span>
            {questionNumber} of {totalQuestions}
          </span>
          <span className="material-symbols-outlined text-[14px] cursor-pointer hover:text-white">
            keyboard_arrow_down
          </span>
        </div>
      </div>

      {/* Question Prompt */}
      <div className="flex items-start gap-2 pt-0.5">
        <span className="text-[12px] font-bold text-white/60 select-none">
          {questionNumber}
        </span>
        <span className="text-[12px] font-medium text-white tracking-tight leading-relaxed">
          {question}
        </span>
      </div>

      {/* Options List */}
      <div className="flex flex-col gap-1.5 pl-3">
        {options.map((opt) => {
          const isSelected = selectedKey === opt.key;

          if (opt.isCustomInput) {
            return (
              <div
                key={opt.key}
                onClick={() => setSelectedKey(opt.key)}
                className={`flex items-center gap-2 px-2 py-1 rounded-[8px] border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70'
                }`}
              >
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/90 select-none">
                  {opt.key}
                </span>
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => {
                    setCustomText(e.target.value);
                    setSelectedKey(opt.key);
                  }}
                  placeholder="Type your answer"
                  className="bg-transparent border-0 outline-none text-[12px] font-['Geist'] text-white placeholder:text-white/40 flex-1 p-0 m-0"
                />
              </div>
            );
          }

          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSelect(opt.key)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-[8px] border text-left transition-all cursor-pointer active:scale-[0.99] ${
                isSelected
                  ? 'bg-white/20 border-white/35 text-white shadow-sm'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
              }`}
            >
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/90 select-none">
                {opt.key}
              </span>
              <span className="text-[12px] tracking-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/10">
        <button
          type="button"
          onClick={handleSkip}
          className="px-2.5 py-1 text-[12px] text-white/60 hover:text-white transition-colors cursor-pointer"
        >
          Skip
        </button>

        <button
          type="button"
          onClick={handleNext}
          className="px-3 py-1 rounded-[7px] bg-blue-500 hover:bg-blue-600 active:scale-95 text-[12px] font-medium text-white shadow-md transition-all cursor-pointer"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export const QuestionTool = React.memo(QuestionToolImpl);
QuestionTool.displayName = 'QuestionTool';

export default QuestionTool;
