import React, { useCallback, useRef } from 'react';

export interface SmoothTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  textClassName?: string;
  placeholderClassName?: string;
  caretColor?: string;
}

/**
 * Textarea with a soft typing feel.
 *
 * An earlier version mirrored the text into a second element and drew its own
 * caret, which meant the caret position had to be re-derived from measured text
 * rects. That is unreliable at line wraps and after newlines, so the caret drifts
 * to the wrong end of the line.
 *
 * Here the native textarea renders its own text and its own caret — always
 * correct, including selection, IME and RTL — and the polish comes from CSS on
 * the real element instead.
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
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

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

    return (
      <div className="smooth-textarea relative w-full">
        {value.length === 0 && placeholder && (
          <span
            aria-hidden="true"
            className={`smooth-textarea-placeholder ${textClassName} ${placeholderClassName}`}
          >
            {placeholder}
          </span>
        )}

        <textarea
          {...rest}
          ref={setRefs}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={undefined}
          className={`smooth-textarea-input ${textClassName} ${className}`}
          style={{ ...style, caretColor }}
        />
      </div>
    );
  }
);

SmoothTextarea.displayName = 'SmoothTextarea';

export default SmoothTextarea;
