import React, { useEffect, useState } from 'react';
import { ProjectIcon as fetchProjectIcon } from '../../../wailsjs/go/main/App';
import { useOrchestratorStore } from './useOrchestratorStore';

// Data URLs by project id. Null means the project has no favicon (or the
// lookup failed); undefined means not looked up yet.
const iconCache = new Map<string, string | null>();

export function useProjectIcon(projectId: string): string | null {
  const showFavicons = useOrchestratorStore((s) => s.showProjectFavicons);
  const [icon, setIcon] = useState<string | null>(() => iconCache.get(projectId) ?? null);

  useEffect(() => {
    if (!showFavicons || !projectId) return;
    const cached = iconCache.get(projectId);
    if (cached !== undefined) {
      setIcon(cached);
      return;
    }
    let cancelled = false;
    void fetchProjectIcon(projectId)
      .then((url) => {
        const next = url || null;
        iconCache.set(projectId, next);
        if (!cancelled) setIcon(next);
      })
      .catch(() => {
        iconCache.set(projectId, null);
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
