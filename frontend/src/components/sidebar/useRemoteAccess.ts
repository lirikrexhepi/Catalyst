import { useState, useEffect, useCallback } from 'react';

export interface RemoteInfo {
  enabled: boolean;
  port: number;
  token: string;
  pin: string;
  localUrl?: string;
  tailscaleUrl?: string;
  publicUrl?: string;
  bestUrl: string;
  qrCodeSvg: string; // Base64 PNG data URL
  activeClients: number;
  hostname: string;
  lanIps?: string[];
  connecting?: boolean;
  downloading?: boolean;
  error?: string;
}

export function useRemoteAccess(poll = true) {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchInfo = useCallback(async () => {
    try {
      const app = (window as any)?.go?.main?.App;
      if (app?.GetRemoteInfo) {
        const res = await app.GetRemoteInfo();
        setInfo(res);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch remote info');
    }
  }, []);

  useEffect(() => {
    void fetchInfo();
    if (!poll) return;

    // Poll faster (1.5s) while establishing the public tunnel, then settle to 5s
    const pollInterval = info?.enabled && (!info?.bestUrl || info?.connecting) ? 1500 : 5000;
    const interval = setInterval(fetchInfo, pollInterval);
    return () => clearInterval(interval);
  }, [fetchInfo, poll, info?.enabled, info?.bestUrl, info?.connecting]);

  const toggle = useCallback(
    async (enable: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const app = (window as any)?.go?.main?.App;
        if (enable) {
          if (app?.StartRemoteServer) {
            const res = await app.StartRemoteServer(4545);
            setInfo(res);
          }
        } else {
          if (app?.StopRemoteServer) {
            await app.StopRemoteServer();
            setInfo((prev) => (prev ? { ...prev, enabled: false } : null));
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to toggle remote server');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const regenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const app = (window as any)?.go?.main?.App;
      if (app?.RegenerateRemoteToken) {
        const res = await app.RegenerateRemoteToken();
        setInfo(res);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to regenerate pairing token');
    } finally {
      setLoading(false);
    }
  }, []);

  const copyUrl = useCallback(() => {
    if (!info?.bestUrl) return;
    navigator.clipboard.writeText(info.bestUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [info?.bestUrl]);

  return {
    info,
    loading,
    error,
    copied,
    toggle,
    regenerate,
    copyUrl,
    refresh: fetchInfo,
  };
}
