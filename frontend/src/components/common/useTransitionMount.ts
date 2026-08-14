import { useState, useEffect } from 'react';

/**
 * Hook to coordinate smooth entrance AND exit animations before unmounting from DOM.
 * Guarantees initial frame commitment so entrance transitions are never skipped.
 * @param isOpen Target open/close boolean state
 * @param durationMs Animation duration in milliseconds
 */
export function useTransitionMount(isOpen: boolean, durationMs: number = 200) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    let mountTimer: ReturnType<typeof setTimeout> | undefined;
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    if (isOpen) {
      setShouldRender(true);
      // Ensure initial frame (opacity 0, scale 0.96) is painted before triggering transition to 1
      mountTimer = setTimeout(() => {
        setIsVisible(true);
      }, 20);
      return () => {
        if (mountTimer) clearTimeout(mountTimer);
      };
    } else {
      setIsVisible(false);
      unmountTimer = setTimeout(() => {
        setShouldRender(false);
      }, durationMs);
      return () => {
        if (unmountTimer) clearTimeout(unmountTimer);
      };
    }
  }, [isOpen, durationMs]);

  return { shouldRender, isVisible };
}
