import { useRef, useEffect, useCallback, type RefObject } from 'react';
import Lenis from 'lenis';

export interface SmoothScrollOptions {
  /** Multiplier for wheel delta. Default: 1.0 */
  speed?: number;
  /** Whether smooth scroll is enabled. Default: true */
  enabled?: boolean;
}

/**
 * Attaches Lenis smooth gliding scroll to a scrollable container matching
 * the Valhalla project configuration (duration: 1.3, quintic exponential easing, smoothWheel: true).
 */
export function useSmoothScroll<T extends HTMLElement = HTMLDivElement>(
  targetRef: RefObject<T | null>,
  options: SmoothScrollOptions = {},
) {
  const { speed = 1.0, enabled = true } = options;
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el || !enabled) return;

    const content = (el.firstElementChild as HTMLElement) || el;

    // Exact kinematic setup from Valhalla project
    const lenis = new Lenis({
      wrapper: el,
      content,
      eventsTarget: el,
      duration: 1.3,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.95 * speed,
      touchMultiplier: 1.5,
      autoResize: true,
    });

    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [enabled, speed, targetRef]);

  const scrollTo = useCallback((target: number, smooth = true) => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { immediate: !smooth });
    } else if (targetRef.current) {
      targetRef.current.scrollTop = target;
    }
  }, [targetRef]);

  const stopGlide = useCallback(() => {
    if (lenisRef.current) {
      lenisRef.current.stop();
      lenisRef.current.start();
    }
  }, []);

  return { scrollTo, stopGlide, lenis: lenisRef };
}

export default useSmoothScroll;
