import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { useSmoothScroll } from './useSmoothScroll';

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  maxHeight?: number | string;
  className?: string;
  children: React.ReactNode;
  smoothScroll?: boolean;
}

/**
 * Reusable minimalistic scroll container with modern arrowless glass scrollbars
 * and continuous physics-based smooth glide scrolling.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ maxHeight, className = '', style = {}, children, smoothScroll = true, ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLDivElement);

    useSmoothScroll(innerRef, { speed: 1.0, enabled: smoothScroll });

    return (
      <div
        ref={innerRef}
        className={`modern-scroll-area overflow-y-auto overflow-x-hidden ${className}`}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';
export default ScrollArea;
