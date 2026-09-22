import React from 'react';
import { useRemoteAccess } from './useRemoteAccess';
import { useTheme } from '../../themes';

export const RemoteAccessSection: React.FC = () => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const { info, loading, copied, toggle, regenerate, copyUrl } = useRemoteAccess(true);

  const isLive = Boolean(info?.enabled);
  const isConnecting = isLive && (info?.connecting || info?.downloading || !info?.bestUrl);

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
      <div className="flex items-center justify-between px-0.5 pt-1">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-rounded text-[18px] leading-none ${
            isLive ? 'text-[#38bdf8]' : 'text-white/40'
          }`}>
            smartphone
          </span>
          <span className="text-[12px] font-semibold font-['Geist'] text-white tracking-tight">
            Phone Remote Access
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isLive}
          disabled={loading}
          onClick={() => void toggle(!isLive)}
          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ${
            isLive
              ? isLight ? 'bg-[#007AFF]' : 'bg-[#38bdf8]'
              : isLight ? 'bg-black/15' : 'bg-white/15'
          } ${loading ? 'opacity-50' : ''}`}
        >
          <div
            className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
              isLive
                ? isLight ? 'translate-x-4 bg-white shadow-sm' : 'translate-x-4 bg-black shadow-sm'
                : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
            }`}
          />
        </button>
      </div>

      <div className="text-[11px] text-white/50 leading-relaxed">
        Control parallel agents from university or cell data while your PC stays at home.
      </div>

      {isLive && info && (
        <div className={`mt-1.5 p-3 rounded-[12px] flex flex-col gap-3 ${
          isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04] border border-white/[0.08]'
        }`}>
          {info.error ? (
            <div className="flex flex-col gap-2 p-3 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
              <div className="flex items-center gap-1.5 font-semibold text-red-200">
                <span className="material-symbols-rounded text-[16px] text-red-400">error</span>
                Tunnel Connection Failed
              </div>
              <div className="text-[10px] text-white/70">{info.error}</div>
              <button
                type="button"
                onClick={() => void toggle(true)}
                className="self-start mt-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-white font-medium rounded text-[10px] cursor-pointer"
              >
                Retry Tunnel
              </button>
            </div>
          ) : isConnecting ? (
            <div className="flex flex-col items-center justify-center py-5 px-3 gap-2 text-center">
              <div className="w-5 h-5 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
              <div className="text-[12px] font-medium text-white/90">
                {info?.downloading ? 'Downloading Cloudflare Gateway...' : 'Establishing Secure Remote Tunnel...'}
              </div>
              <div className="text-[11px] text-white/50 max-w-[240px]">
                Connecting via Cloudflare so your phone can reach this PC from any external mobile network.
              </div>
            </div>
          ) : (
            <>
              {/* QR Code & PIN Display */}
              <div className="flex items-center gap-3">
                {info.qrCodeSvg ? (
                  <div className="p-1.5 bg-white rounded-[10px] shadow-sm shrink-0">
                    <img
                      src={info.qrCodeSvg}
                      alt="Pairing QR Code"
                      className="w-[100px] h-[100px] object-contain block"
                    />
                  </div>
                ) : (
                  <div className="w-[100px] h-[100px] bg-white/10 rounded-[10px] flex items-center justify-center text-[10px] text-white/50">
                    Generating QR...
                  </div>
                )}

                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[10px] font-semibold text-[#38bdf8] uppercase tracking-wider">
                    Scan With Phone Camera
                  </span>
                  <div className="text-[11px] text-white/70">
                    Accessible anywhere worldwide via secure HTTPS tunnel.
                  </div>
                  <div className="text-[10px] text-white/40 mt-1">
                    Scan the code with your phone — no typing needed.
                  </div>
                </div>
              </div>

              {/* Connection URL Bar */}
              <div className="flex items-center gap-2 bg-black/30 p-2 rounded-[8px] border border-white/[0.06]">
                <input
                  type="text"
                  readOnly
                  value={info.bestUrl}
                  className="bg-transparent text-[11px] font-mono text-[#38bdf8] select-all outline-none flex-1 truncate"
                />
                <button
                  type="button"
                  onClick={copyUrl}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-[6px] bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 text-[#38bdf8] cursor-pointer transition-colors shrink-0"
                >
                  {copied ? '✓ Copied' : 'Copy Link'}
                </button>
              </div>

              {/* Status Indicators */}
              <div className="flex items-center justify-between text-[10px] text-white/40 pt-1">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  Cloudflare Tunnel Active (Worldwide / Cell Data)
                </span>
                <span className="text-white/60 font-mono">
                  {info.activeClients} connected
                </span>
              </div>

              {/* Advanced action */}
              <div className="flex items-center justify-end pt-1 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => void regenerate()}
                  className="text-[10px] text-white/40 hover:text-[#f87171] cursor-pointer"
                >
                  Regenerate Pairing Token
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
