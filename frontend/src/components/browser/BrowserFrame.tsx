import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
import { BrowserTab } from './useBrowser';

export interface BrowserFrameProps {
  tab: BrowserTab;
  onBlocked: (tabId: string) => void;
}

// A site refusing to be framed still fires `load` on the iframe element, so a
// refusal cannot be told from a slow page by events alone. Anything that has not
// painted by now is treated as refused; the surface only offers an escape hatch,
// so a false positive costs nothing but an extra button.
const BLOCK_GRACE_MS = 3_500;

const FRAME_STYLE: React.CSSProperties = {
  border: 'none',
  display: 'block',
  backgroundColor: '#ffffff',
};

/**
 * The page surface.
 *
 * Isolated from the chrome around it so the eventual swap to a real embedded
 * browser touches this file and nothing else: the tab model, address bar and
 * discovery all speak in URLs, not frames.
 */
export const BrowserFrame: React.FC<BrowserFrameProps> = ({ tab, onBlocked }) => {
  const [isLoading, setLoading] = useState(tab.url !== 'about:blank');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Keyed by nonce as well as url so a reload of the same address restarts the
  // probe rather than leaving the previous verdict in place.
  useEffect(() => {
    clearTimer();
    if (tab.url === 'about:blank' || tab.blocked) {
      setLoading(false);
      return;
    }

    setLoading(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setLoading(false);

      // Same-origin access throwing is the reliable refusal signal we can read;
      // when it is readable, an unpopulated document means nothing rendered.
      const frame = frameRef.current;
      if (!frame) return;
      try {
        const doc = frame.contentDocument;
        if (doc && doc.body && doc.body.childElementCount === 0) onBlocked(tab.id);
      } catch {
        // Cross-origin and therefore actually rendering: not blocked.
      }
    }, BLOCK_GRACE_MS);

    return clearTimer;
  }, [tab.id, tab.url, tab.nonce, tab.blocked, onBlocked, clearTimer]);

  const handleLoad = useCallback(() => setLoading(false), []);

  if (!tab.url || tab.url === 'about:blank') {
    return (
      <div className="flex-1 min-h-0 rounded-[12px] bg-white/[0.03] border border-white/[0.07] grid place-items-center">
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <span className="material-symbols-rounded text-[26px] text-white/25 leading-none">
            globe
          </span>
          <span className="text-[12px] font-['Geist'] text-white/40 leading-relaxed">
            Enter an address, or pick a detected port above.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 relative rounded-[12px] overflow-hidden border border-white/[0.09] bg-white">
      <iframe
        // Remounting on nonce is what makes reload work: the parent cannot call
        // location.reload() across an origin boundary.
        key={`${tab.id}-${tab.nonce}`}
        ref={frameRef}
        src={tab.url}
        title={tab.url}
        onLoad={handleLoad}
        className="w-full h-full"
        style={FRAME_STYLE}
        // Permissive enough for a dev server to behave normally, while still
        // withholding top-level navigation so a framed page cannot replace the app.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        allow="clipboard-read; clipboard-write; fullscreen"
      />

      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden bg-black/10">
          <div className="h-full w-1/3 bg-white/70 animate-[browser-progress_1.1s_ease-in-out_infinite]" />
        </div>
      )}

      {tab.blocked && (
        <div className="absolute inset-0 grid place-items-center bg-[#1b1e24]">
          <div className="flex flex-col items-center gap-2.5 px-8 text-center max-w-[340px]">
            <span className="material-symbols-rounded text-[26px] text-white/30 leading-none">
              public_off
            </span>
            <span className="text-[12.5px] font-medium font-['Geist'] text-white/80 tracking-tight">
              This site refused to be embedded
            </span>
            <span className="text-[11.5px] font-['Geist'] text-white/45 leading-relaxed">
              It sends an <span className="font-mono text-white/60">X-Frame-Options</span> or
              frame-ancestors policy that blocks preview panes. Local dev servers are unaffected.
            </span>
            <button
              type="button"
              onClick={() => BrowserOpenURL(tab.url)}
              className="mt-1 h-[26px] px-3 rounded-[8px] bg-white/10 hover:bg-white/18 active:scale-95 text-[11.5px] font-medium font-['Geist'] text-white/80 hover:text-white transition-all duration-150 cursor-pointer"
            >
              Open in system browser
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrowserFrame;
