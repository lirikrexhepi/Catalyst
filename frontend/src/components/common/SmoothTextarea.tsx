import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';

export interface SmoothTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  textClassName?: string;
  placeholderClassName?: string;
  caretColor?: string;
}

interface CaretRect {
  left: number;
  top: number;
  height: number;
}

/**
 * Textarea with Monkeytype-style smooth typing.
 *
 * A native textarea cannot animate its own caret or stagger glyph appearance, so the
 * real textarea is made transparent and kept purely as the input surface, while a
 * mirrored layer underneath renders the visible text. The mirror shares the textarea's
 * exact typography and box metrics, so the two stay in perfect alignment.
 *
 * The caret is a separate element that transitions between measured positions, which is
 * what produces the trailing glide; newly committed characters fade and lift in.
 */
export const SmoothTextarea = React.forwardRef<HTMLTextAreaElement, SmoothTextareaProps>(
  (
    {
      value,
      onValueChange,
      textClassName = '',
      placeholderClassName = '',
      caretColor = 'currentColor',
      className = '',
      style,
      placeholder,
      onSelect,
      onKeyUp,
      onClick,
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);
    const measureRef = useRef<HTMLSpanElement | null>(null);

    const [caret, setCaret] = useState<CaretRect | null>(null);
    const [isFocused, setIsFocused] = useState(false);

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    // Position the caret by measuring the width of the text preceding the selection.
    const syncCaret = useCallback(() => {
      const el = innerRef.current;
      const measure = measureRef.current;
      const mirror = mirrorRef.current;
      if (!el || !measure || !mirror) return;

      const caretIndex = el.selectionStart ?? value.length;
      measure.textContent = value.slice(0, caretIndex);

      const rects = measure.getClientRects();
      const mirrorRect = mirror.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(mirror).lineHeight) || 20;

      if (rects.length === 0) {
        setCaret({ left: 0, top: 0, height: lineHeight });
        return;
      }

      const last = rects[rects.length - 1];
      setCaret({
        left: last.right - mirrorRect.left,
        top: last.top - mirrorRect.top,
        height: last.height || lineHeight,
      });
    }, [value]);

    useLayoutEffect(() => {
      syncCaret();
    }, [syncCaret, value]);

    useEffect(() => {
      const onResize = () => syncCaret();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [syncCaret]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onValueChange(e.target.value);
    };

    const chars = Array.from(value);

    return (
      <div className="smooth-textarea relative w-full">
        {/* Visible mirrored text. Shares typography with the textarea via textClassName. */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={`smooth-textarea-mirror ${textClassName}`}
          style={style}
        >
          {chars.map((ch, i) => (
            <span key={i} className="smooth-char">
              {ch === '\n' ? '​\n' : ch}
            </span>
          ))}
          {/* Trailing zero-width space keeps the final empty line measurable. */}
          <span>{'​'}</span>

          {/* Off-flow measuring span used only to locate the caret. */}
          <span ref={measureRef} className="smooth-textarea-measure" aria-hidden="true" />

          {value.length === 0 && placeholder && (
            <span className={`smooth-textarea-placeholder ${placeholderClassName}`}>
              {placeholder}
            </span>
          )}
        </div>

        {caret && (
          <span
            className={`smooth-caret ${isFocused ? 'is-focused' : ''}`}
            style={{
              transform: `translate3d(${caret.left}px, ${caret.top}px, 0)`,
              height: `${caret.height}px`,
              background: caretColor,
            }}
          />
        )}

        {/* The real input: transparent, but still owns focus, selection and IME. */}
        <textarea
          {...rest}
          ref={setRefs}
          value={value}
          onChange={handleChange}
          placeholder={undefined}
          className={`smooth-textarea-input ${textClassName} ${className}`}
          style={style}
          onFocus={(e) => {
            setIsFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            rest.onBlur?.(e);
          }}
          onSelect={(e) => {
            syncCaret();
            onSelect?.(e);
          }}
          onKeyUp={(e) => {
            syncCaret();
            onKeyUp?.(e);
          }}
          onClick={(e) => {
            syncCaret();
            onClick?.(e);
          }}
        />
      </div>
    );
  }
);

SmoothTextarea.displayName = 'SmoothTextarea';

export default SmoothTextarea;
