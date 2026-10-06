import React, { useEffect, useState } from 'react';
import { ProjectIcon as fetchProjectIcon } from '../../../wailsjs/go/main/App';
import { useOrchestratorStore } from './useOrchestratorStore';

// Data URLs by project id with a short TTL so a favicon added or changed
// mid-session shows up without a restart. Null means the project has no
// favicon (or the lookup failed); undefined means not looked up yet.
const iconCache = new Map<string, { url: string | null; at: number }>();
const ICON_TTL_MS = 10 * 60_000;

function cachedIcon(projectId: string): { url: string | null; fresh: boolean } {
  const entry = iconCache.get(projectId);
  if (!entry) return { url: null, fresh: false };
  if (Date.now() - entry.at > ICON_TTL_MS) {
    iconCache.delete(projectId);
    return { url: null, fresh: false };
  }
  return { url: entry.url, fresh: true };
}

export function useProjectIcon(projectId: string): string | null {
  const showFavicons = useOrchestratorStore((s) => s.showProjectFavicons);
  const [icon, setIcon] = useState<string | null>(() => cachedIcon(projectId).url);

  useEffect(() => {
    if (!showFavicons || !projectId) return;
    const cached = cachedIcon(projectId);
    if (cached.fresh) {
      setIcon(cached.url);
      return;
    }
    let cancelled = false;
    void fetchProjectIcon(projectId)
      .then((url) => {
        const next = url || null;
        iconCache.set(projectId, { url: next, at: Date.now() });
        if (!cancelled) setIcon(next);
      })
      .catch(() => {
        iconCache.set(projectId, { url: null, at: Date.now() });
        if (!cancelled) setIcon(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, showFavicons]);

  return showFavicons ? icon : null;
}

export interface ProjectGlyphProps {
  projectId: string;
  size?: number;
  glyph: React.ReactNode;
}

/** The project's app icon when favicons are enabled and one resolves,
 *  otherwise the caller's folder glyph. */
export const ProjectGlyph: React.FC<ProjectGlyphProps> = ({ projectId, size = 16, glyph }) => {
  const icon = useProjectIcon(projectId);
  if (!icon) return <>{glyph}</>;
  return (
    <img
      src={icon}
      alt=""
      draggable={false}
      width={size}
      height={size}
      className="shrink-0 rounded-[4px] object-contain"
      style={{ width: size, height: size }}
    />
  );
};
