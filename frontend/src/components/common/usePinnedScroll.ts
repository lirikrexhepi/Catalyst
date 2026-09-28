import { useEffect, useRef, type RefObject } from 'react';

interface PinnedScrollOptions {
  /** Distance from the bottom that still counts as being at it. Default 48. */
  near?: number;
  /** How new content reaches the bottom (Lenis-aware callers pass their own). */
  scroll?: (el: HTMLElement, top: number) => void;
}

type PinListener = () => void;

const pinListeners = new Set<PinListener>();

/**
 * Sends every pinned feed to the bottom. Sending a message is an explicit
 * intent to be there: the sender calls this right after dispatching, so the
 * follow effect below lands on a pinned feed once the bubble renders.
 */
export function requestPinToBottom() {
  pinListeners.forEach((pin) => pin());
}

/**
 * Keeps a streaming feed glued to the bottom while the user is down there,
 * and leaves them alone once they scroll up to read.
 *
 * Gestures unpin, arrivals re-pin, and programmatic jumps never unpin: a jump
 * that lands short while content is still growing must not kill the follow,
 * which is what stranded feeds mid-stream. A resize observer covers late
 * growth (images, highlights) that lands with no new data.
 */
export function usePinnedScroll(
  targetRef: RefObject<HTMLElement | null>,
  followInputs: unknown[],
  options: PinnedScrollOptions = {},
) {
  const { near = 48 } = options;
  const pinned = useRef(true);
  const scrollRef = useRef(options.scroll);
  scrollRef.current = options.scroll;

  const jump = () => {
    const el = targetRef.current;
    if (!el || !pinned.current) return;
    const top = el.scrollHeight;
    const fn = scrollRef.current;
    if (fn) fn(el, top);
    else el.scrollTop = top;
  };

  useEffect(() => {
    jump();
    // Follow inputs intentionally drive this, like the blocks array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, followInputs);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const pin = () => {
      pinned.current = true;
      const top = el.scrollHeight;
      const fn = scrollRef.current;
      if (fn) fn(el, top);
      else el.scrollTop = top;
    };
    pinListeners.add(pin);
    const distance = () => el.scrollHeight - el.scrollTop - el.clientHeight;    // Wheel, touch, scrollbar drags and keys arrive here; programmatic jumps
    // only ever fire scroll, so they can never trip this.
    const onGesture = () => {
      if (distance() > near) pinned.current = false;
    };
    const onScroll = () => {
      if (distance() < near) pinned.current = true;
    };
    const content = el.firstElementChild ?? el;
    const ro = new ResizeObserver(() => {
      if (!pinned.current) return;
      const top = el.scrollHeight;
      const fn = scrollRef.current;
      if (fn) fn(el, top);
      else el.scrollTop = top;
    });
    el.addEventListener('wheel', onGesture, { passive: true });
    el.addEventListener('touchmove', onGesture, { passive: true });
    el.addEventListener('mousedown', onGesture);
    el.addEventListener('keydown', onGesture);
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(content);
    return () => {
      pinListeners.delete(pin);
      el.removeEventListener('wheel', onGesture);
      el.removeEventListener('touchmove', onGesture);
      el.removeEventListener('mousedown', onGesture);
      el.removeEventListener('keydown', onGesture);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [near]);
}
