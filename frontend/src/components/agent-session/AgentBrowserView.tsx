import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
import { servers } from '../../../wailsjs/go/models';

export interface AgentBrowserViewProps {
  threadId?: string;
  detectedServers?: servers.Server[];
  isFocused?: boolean;
  isAnimating?: boolean;
  onFocusCard?: () => void;
  className?: string;
}

export function smartNormalizeUrl(input: string, fallbackPort?: number): string {
  const trimmed = input.trim();
  if (!trimmed) {
    if (fallbackPort) return `http://localhost:${fallbackPort}`;
    return 'about:blank';
  }

  // Bare port like 5173 or :5173
  if (/^:?\d+$/.test(trimmed)) {
    const port = trimmed.replace(/^:/, '');
    return `http://localhost:${port}`;
  }

  // Starts with scheme like http:// or https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // localhost with optional port/path
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  // IP address with optional port/path
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed)) {
    return `http://${trimmed}`;
  }

  // Standard domain like github.com, apple.com/design, foo.dev
  if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Search query (e.g. "how to do X in vite")
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export const AgentBrowserView: React.FC<AgentBrowserViewProps> = ({
  threadId,
  detectedServers = [],
  isFocused = true,
  isAnimating = false,
  onFocusCard,
  className = '',
}) => {
  // Find primary web dev server port
  const webServers = detectedServers.filter((s) => !s.agent && s.port > 0);
  const primaryServer = webServers[0];
  const defaultUrl = primaryServer ? `http://localhost:${primaryServer.port}` : 'about:blank';

  const [currentUrl, setCurrentUrl] = useState<string>(defaultUrl);
  const [inputUrl, setInputUrl] = useState<string>(defaultUrl === 'about:blank' ? '' : defaultUrl);
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [historyStack, setHistoryStack] = useState<string[]>([defaultUrl]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  // Auto-pause background WebGL to preserve 120 FPS across multiple cards
  const [autoPauseBackground, setAutoPauseBackground] = useState<boolean>(true);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blockTimerRef = useRef<number | null>(null);

  // When card regains focus, dispatch synthetic resize to refresh WebGL viewport buffer
  useEffect(() => {
    if (isFocused && iframeRef.current) {
      const timer = setTimeout(() => {
        try {
          iframeRef.current?.contentWindow?.dispatchEvent(new Event('resize'));
        } catch {
          // Cross-origin safety
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isFocused]);

  // If a dev server was newly detected and we were on about:blank, auto-navigate to it
  useEffect(() => {
    if (primaryServer && (currentUrl === 'about:blank' || !currentUrl)) {
      const url = `http://localhost:${primaryServer.port}`;
      setCurrentUrl(url);
      setInputUrl(url);
      setHistoryStack([url]);
      setHistoryIndex(0);
    }
  }, [primaryServer, currentUrl]);

  // Keep inputUrl in sync when currentUrl changes
  useEffect(() => {
    setInputUrl(currentUrl === 'about:blank' ? '' : currentUrl);
  }, [currentUrl]);

  // Handle iframe load detection & block probe
  useEffect(() => {
    if (blockTimerRef.current !== null) {
      window.clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }

    if (!currentUrl || currentUrl === 'about:blank') {
      setIsLoading(false);
      setIsBlocked(false);
      return;
    }

    setIsLoading(true);
    setIsBlocked(false);

    blockTimerRef.current = window.setTimeout(() => {
      setIsLoading(false);
      const frame = iframeRef.current;
      if (!frame) return;
      try {
        const doc = frame.contentDocument;
        if (doc && doc.body && doc.body.childElementCount === 0) {
          setIsBlocked(true);
        }
      } catch {
        // Cross-origin means it rendered successfully
      }
    }, 3200);

    return () => {
      if (blockTimerRef.current !== null) {
        window.clearTimeout(blockTimerRef.current);
      }
    };
  }, [currentUrl, reloadNonce]);

  const navigateTo = useCallback(
    (target: string) => {
      const normalized = smartNormalizeUrl(target, primaryServer?.port);
      setCurrentUrl(normalized);
      setInputUrl(normalized === 'about:blank' ? '' : normalized);
      setHistoryStack((prev) => [...prev.slice(0, historyIndex + 1), normalized]);
      setHistoryIndex((prev) => prev + 1);
    },
    [primaryServer, historyIndex],
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateTo(inputUrl);
    }
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      const prevUrl = historyStack[newIdx];
      setCurrentUrl(prevUrl);
      setInputUrl(prevUrl === 'about:blank' ? '' : prevUrl);
    }
  };

  const handleForward = () => {
    if (historyIndex < historyStack.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      const nextUrl = historyStack[newIdx];
      setCurrentUrl(nextUrl);
      setInputUrl(nextUrl === 'about:blank' ? '' : nextUrl);
    }
  };

  const handleReload = () => {
    setReloadNonce((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    if (currentUrl && currentUrl !== 'about:blank') {
      void BrowserOpenURL(currentUrl);
    } else if (primaryServer) {
      void BrowserOpenURL(`http://localhost:${primaryServer.port}`);
    }
  };

  const isLocalhost = currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1');
  const shouldPause = !isFocused && autoPauseBackground;

  return (
    <div className={`flex flex-col h-full w-full min-h-0 select-none ${className}`}>
      {/* Top Browser Toolbar (macOS / Safari style) */}
      <div className="flex items-center justify-between gap-2 pb-2.5 pt-0.5 px-0.5 border-b border-white/10 shrink-0">
        {/* Nav actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="Back"
            disabled={historyIndex <= 0}
            onClick={handleBack}
            className={`w-6 h-6 rounded-[6px] flex items-center justify-center transition-all ${
              historyIndex > 0
                ? 'text-white/80 hover:bg-white/10 active:scale-95 cursor-pointer'
                : 'text-white/20 cursor-default'
            }`}
          >
            <span className="material-symbols-rounded text-[15px] leading-none">arrow_back</span>
          </button>
          <button
            type="button"
            title="Forward"
            disabled={historyIndex >= historyStack.length - 1}
            onClick={handleForward}
            className={`w-6 h-6 rounded-[6px] flex items-center justify-center transition-all ${
              historyIndex < historyStack.length - 1
                ? 'text-white/80 hover:bg-white/10 active:scale-95 cursor-pointer'
                : 'text-white/20 cursor-default'
            }`}
          >
            <span className="material-symbols-rounded text-[15px] leading-none">arrow_forward</span>
          </button>
          <button
            type="button"
            title="Reload"
            onClick={handleReload}
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <span className={`material-symbols-rounded text-[15px] leading-none ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>

        {/* Smart Address Bar */}
        <div className="flex-1 min-w-[200px] max-w-[620px] mx-auto relative flex items-center">
          <div className="w-full h-[28px] px-2.5 rounded-[6px] bg-white/[0.07] border border-white/[0.12] hover:border-white/20 focus-within:border-[#007AFF]/60 focus-within:bg-black/40 flex items-center gap-2 transition-all">
            <span className="material-symbols-rounded text-[13px] text-white/45 shrink-0 leading-none">
              {isLocalhost ? 'computer' : currentUrl.startsWith('https') ? 'lock' : 'search'}
            </span>
            <input
              type="text"
              value={inputUrl}
              placeholder={
                primaryServer
                  ? `localhost:${primaryServer.port} or search Google…`
                  : 'Enter address or search Google…'
              }
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onFocus={(e) => e.target.select()}
              className="w-full bg-transparent text-[12px] font-medium font-['Geist'] text-white placeholder:text-white/40 focus:outline-none tracking-tight select-text"
            />
            {isLoading && (
              <span className="w-2 h-2 rounded-full border border-white/60 border-t-transparent animate-spin shrink-0" />
            )}
          </div>
        </div>

        {/* Right quick actions: Detected server ports & Open in browser */}
        <div className="flex items-center gap-1.5 shrink-0">
          {webServers.map((s) => (
            <button
              key={s.port}
              type="button"
              title={`Switch to dev server on port ${s.port}`}
              onClick={() => navigateTo(`http://localhost:${s.port}`)}
              className={`h-[24px] px-2 rounded-[6px] flex items-center gap-1 text-[11px] font-medium font-mono transition-all cursor-pointer border ${
                currentUrl.includes(`:${s.port}`)
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 shadow-sm'
                  : 'bg-white/[0.05] border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>:{s.port}</span>
            </button>
          ))}

          {/* Power Save / Live Always Toggle */}
          <button
            type="button"
            title={
              autoPauseBackground
                ? 'Power Save: WebGL auto-pauses when unfocused to preserve 120 FPS performance (Click to keep live)'
                : 'Live Always: WebGL renders continuously in background (Click to enable Power Save)'
            }
            onClick={() => setAutoPauseBackground((prev) => !prev)}
            className={`h-[24px] px-2 rounded-[6px] flex items-center gap-1 text-[11px] font-medium font-['Geist'] transition-all cursor-pointer border ${
              autoPauseBackground
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            <span className="material-symbols-rounded text-[13px] leading-none">
              {autoPauseBackground ? 'energy_savings_leaf' : 'bolt'}
            </span>
            <span>{autoPauseBackground ? 'Power Save' : 'Live Always'}</span>
          </button>

          <button
            type="button"
            title="Open in external browser (Chrome/Edge)"
            onClick={handleOpenExternal}
            className="h-[24px] px-2 rounded-[6px] bg-white/[0.07] hover:bg-white/15 border border-white/10 active:scale-95 text-white/75 hover:text-white text-[11px] font-medium font-['Geist'] flex items-center gap-1 transition-all cursor-pointer"
          >
            <span>Open</span>
            <span className="material-symbols-rounded text-[13px] leading-none">open_in_new</span>
          </button>
        </div>
      </div>

      {/* Browser Viewport */}
      <div
        className="flex-1 min-h-0 relative mt-2.5 rounded-[10px] overflow-hidden border border-white/10 bg-[#121316]"
        style={{
          contain: 'strict',
          transform: 'translate3d(0, 0, 0)',
        }}
      >
        {currentUrl && currentUrl !== 'about:blank' ? (
          <>
            {/* Unfocused Click Shield: captures clicks to focus card and prevents mousemove/drag from hijacking 3D WebGL */}
            {!isFocused && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusCard?.();
                }}
                className="absolute inset-0 z-30 cursor-pointer bg-black/10 transition-opacity"
                title="Click to focus card"
              />
            )}

            {/* Animation Shield: disables pointer events & prevents layout jitter during deck/grid fly transitions */}
            {isAnimating && (
              <div className="absolute inset-0 z-40 pointer-events-none bg-transparent" />
            )}

            {/* Paused Overlay: shown when unfocused with Power Save enabled */}
            {shouldPause && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusCard?.();
                }}
                className="absolute inset-0 z-25 bg-[#121316]/92 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 cursor-pointer group transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center mb-3 shadow-xl group-hover:scale-105 group-hover:bg-white/[0.1] transition-all duration-200">
                  <span className="material-symbols-rounded text-emerald-400 text-2xl">
                    view_in_ar
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-medium mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>3D Preview Paused • State Preserved</span>
                </div>
                <p className="text-[12px] font-medium font-['Geist'] text-white/50 max-w-xs mb-3 leading-relaxed">
                  WebGL rendering halted to maintain silky 120 FPS across your agent cards.
                </p>
                <div className="px-3.5 py-1.5 rounded-[8px] bg-white/[0.08] hover:bg-white/15 border border-white/15 text-white text-[12px] font-medium flex items-center gap-1.5 transition-all shadow-md group-hover:border-white/30">
                  <span>Click to Resume Preview</span>
                  <span className="material-symbols-rounded text-[14px]">play_arrow</span>
                </div>
              </div>
            )}

            <iframe
              key={`${currentUrl}-${reloadNonce}`}
              ref={iframeRef}
              src={currentUrl}
              title="Agent Web Preview"
              onLoad={() => setIsLoading(false)}
              className="w-full h-full border-none bg-white"
              style={{
                visibility: shouldPause ? 'hidden' : 'visible',
                pointerEvents: isFocused && !isAnimating ? 'auto' : 'none',
              }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              allow="clipboard-read; clipboard-write; fullscreen; camera; microphone"
            />

            {isLoading && (
              <div className="absolute top-0 inset-x-0 h-[2.5px] bg-black/10 overflow-hidden z-10">
                <div className="h-full w-1/3 bg-[#007AFF] animate-[browser-progress_1.1s_ease-in-out_infinite]" />
              </div>
            )}

            {isBlocked && (
              <div className="absolute inset-0 bg-[#16181d] flex flex-col items-center justify-center text-center p-6 z-20">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                  <span className="material-symbols-rounded text-white/60 text-xl">public_off</span>
                </div>
                <h4 className="text-[13.5px] font-semibold font-['Geist'] text-white/90 mb-1">
                  Site embedding restricted
                </h4>
                <p className="text-[12px] text-white/50 max-w-sm mb-4 leading-relaxed font-['Geist']">
                  This site restricts iframe embedding for security reasons. You can view it directly in your browser.
                </p>
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="px-3.5 py-1.5 rounded-[6px] bg-[#007AFF] hover:bg-[#0A84FF] text-white text-[12px] font-medium flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  <span>Open in Default Browser</span>
                  <span className="material-symbols-rounded text-[14px]">open_in_new</span>
                </button>
              </div>
            )}
          </>
        ) : (
          /* Empty / Start Surface */
          <div className="w-full h-full bg-[#121316] flex flex-col items-center justify-center text-center p-6 select-none">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center mb-3.5 shadow-xl">
              <span className="material-symbols-rounded text-white/60 text-2xl">language</span>
            </div>
            <h3 className="text-[15px] font-semibold font-['Geist'] text-white/90 tracking-tight mb-1">
              Web Preview
            </h3>
            <p className="text-[12px] font-medium font-['Geist'] text-white/45 max-w-xs mb-5 leading-relaxed">
              {primaryServer
                ? `Dev server running on localhost:${primaryServer.port}`
                : 'Start a dev server or enter an address above to preview.'}
            </p>

            {primaryServer && (
              <button
                type="button"
                onClick={() => navigateTo(`http://localhost:${primaryServer.port}`)}
                className="px-4 py-2 rounded-[8px] bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[12.5px] font-medium flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Launch localhost:{primaryServer.port}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentBrowserView;
