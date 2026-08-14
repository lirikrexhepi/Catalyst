import { useState, useEffect, useRef, useId, useMemo, CSSProperties } from 'react';
import { DisplacementMapResult, LiquidGlassProps } from './types';
import { generateLiquidGlassMaps } from './mapGenerator';

const SIZE_STEP = 8;

export function useLiquidGlass(props: LiquidGlassProps = {}) {
  const {
    radius = 20,
    bezelWidth = 20,
    surface = 'squircle',
    glassThickness = 28,
    baseThickness = 5,
    refractionScale = 0.8,
    blur = 0.6,
    frost = 6,
    frostSaturation = 150,
    specularOpacity = 0.6,
    specularSaturation = 6,
    lightAngle = -45,
    lightElevation = 45,
    tint = 'rgba(20, 20, 24, 0.80)',
    shadow = 'apple',
    border = true,
    disableRefraction = false,
  } = props;

  const rawId = useId();
  const filterId = useMemo(
    () => `lg-filter-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [rawId]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const [mapResult, setMapResult] = useState<DisplacementMapResult | null>(null);

  // Measure border-box dimensions, snapped to a quantization step. The generated maps
  // are stretched with preserveAspectRatio="none", so sub-step size differences are not
  // visible, while snapping keeps a resize drag on a handful of cached maps instead of
  // regenerating one per pixel of travel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const commit = (rawW: number, rawH: number) => {
      if (rawW <= 0 || rawH <= 0) return;
      const w = Math.max(SIZE_STEP, Math.round(rawW / SIZE_STEP) * SIZE_STEP);
      const h = Math.max(SIZE_STEP, Math.round(rawH / SIZE_STEP) * SIZE_STEP);
      setDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };

    const rect = el.getBoundingClientRect();
    commit(rect.width || el.offsetWidth, rect.height || el.offsetHeight);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      if (entry.borderBoxSize && entry.borderBoxSize.length > 0) {
        commit(entry.borderBoxSize[0].inlineSize, entry.borderBoxSize[0].blockSize);
      } else {
        const r = el.getBoundingClientRect();
        commit(r.width || el.offsetWidth, r.height || el.offsetHeight);
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute radius in pixels
  const resolvedRadius = useMemo(() => {
    if (radius === 'full') {
      return Math.min(dimensions.width || 100, dimensions.height || 100) / 2;
    }
    return typeof radius === 'number' ? radius : 20;
  }, [radius, dimensions.width, dimensions.height]);

  // Generate displacement and specular maps whenever outer dimensions or optical params
  // change. Map generation rasterizes a canvas and encodes two PNGs synchronously, so it
  // is scheduled off the critical path; the previously generated map stays applied until
  // the replacement is ready, which keeps resizes flicker-free.
  useEffect(() => {
    if (disableRefraction) return;
    if (dimensions.width <= 0 || dimensions.height <= 0) return;

    let cancelled = false;

    const build = () => {
      if (cancelled) return;
      const result = generateLiquidGlassMaps(
        dimensions.width,
        dimensions.height,
        resolvedRadius,
        {
          bezelWidth,
          surface,
          glassThickness,
          baseThickness,
          lightAngle,
          lightElevation,
        }
      );
      if (!cancelled) setMapResult(result);
    };

    const schedule =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(build, { timeout: 120 })
        : requestAnimationFrame(build);

    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function' && typeof requestIdleCallback === 'function') {
        cancelIdleCallback(schedule as number);
      } else {
        cancelAnimationFrame(schedule as number);
      }
    };
  }, [
    dimensions.width,
    dimensions.height,
    resolvedRadius,
    bezelWidth,
    surface,
    glassThickness,
    baseThickness,
    lightAngle,
    lightElevation,
    disableRefraction,
  ]);

  // Compute Apple-grade glass shadows
  const resolvedShadow = useMemo(() => {
    if (!shadow || shadow === 'none') return 'none';
    if (shadow === 'subtle') {
      return '0 4px 12px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)';
    }
    if (shadow === 'apple') {
      return '0 20px 50px rgba(0, 0, 0, 0.45), 0 4px 14px rgba(0, 0, 0, 0.25), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)';
    }
    if (shadow === 'elevated') {
      return '0 28px 60px rgba(0, 0, 0, 0.55), 0 6px 18px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.35)';
    }
    if (shadow === 'dramatic') {
      return '0 36px 80px rgba(0, 0, 0, 0.65), 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.45)';
    }
    return shadow;
  }, [shadow]);

  // Compute border styling
  const resolvedBorder = useMemo(() => {
    if (!border) return undefined;
    if (typeof border === 'string') return border;
    return '1px solid rgba(255, 255, 255, 0.14)';
  }, [border]);

  // Computed container style matching Image 2
  const containerStyle: CSSProperties = useMemo(() => {
    const isReady = !!mapResult && !disableRefraction;
    // Frosting and refraction are separate effects composed into one backdrop chain.
    // The SVG graph only bends light around the bezel, so on its own the interior stays
    // fully transparent; the blur/saturate pair is what actually obscures the backdrop.
    const frostValue = frost > 0 ? `blur(${frost}px) saturate(${frostSaturation}%)` : '';
    const filterValue = disableRefraction
      ? frostValue || undefined
      : [frostValue, isReady ? `url(#${filterId})` : '']
          .filter(Boolean)
          .join(' ');

    return {
      position: 'relative',
      borderRadius: `${resolvedRadius}px`,
      backgroundColor: tint,
      backdropFilter: filterValue,
      WebkitBackdropFilter: filterValue,
      boxShadow: resolvedShadow,
      border: resolvedBorder,
      overflow: 'hidden',
      // Promote to a dedicated compositor layer so the blurred backdrop can be cached
      // between frames. Deliberately NOT using `contain: paint` or `isolation: isolate`
      // here: both make this element its own backdrop root, which forces the filter to
      // be re-resolved from scratch every frame instead of reusing the cached surface.
      transform: 'translateZ(0)',
      backfaceVisibility: 'hidden',
    };
  }, [
    resolvedRadius,
    tint,
    mapResult,
    filterId,
    resolvedShadow,
    resolvedBorder,
    disableRefraction,
    frost,
    frostSaturation,
  ]);

  const filterProps = useMemo(
    () => ({
      filterId,
      mapResult: disableRefraction ? null : mapResult,
      blur,
      refractionScale,
      specularOpacity,
      specularSaturation,
    }),
    [
      filterId,
      mapResult,
      disableRefraction,
      blur,
      refractionScale,
      specularOpacity,
      specularSaturation,
    ]
  );

  return {
    ref: containerRef,
    filterId,
    mapResult,
    dimensions,
    isReady: !!mapResult,
    containerStyle,
    filterProps,
  };
}
