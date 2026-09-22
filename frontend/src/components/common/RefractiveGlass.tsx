import React, {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  forwardRef,
  useImperativeHandle,
  CSSProperties,
} from 'react';

export interface RefractiveGlassProps {
  children?: React.ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: 'R' | 'G' | 'B' | 'A';
  yChannel?: 'R' | 'G' | 'B' | 'A';
  mixBlendMode?: string;
  className?: string;
  style?: CSSProperties;
  disableRefraction?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

const QUANTIZE_STEP = 8;

/**
 * Optical Refractive Glass component inspired by ShuttleTV (https://shuttletv.su/).
 * Uses multi-channel SVG displacement maps with independent RGB channel offsets
 * to simulate real optical lens refraction and physical chromatic dispersion (color fringing).
 */
export const RefractiveGlass = forwardRef<HTMLDivElement, RefractiveGlassProps>(
  (
    {
      children,
      width,
      height,
      borderRadius = 26,
      borderWidth = 0.07,
      brightness = 50,
      opacity = 0.93,
      blur = 7,
      displace = 0.5,
      backgroundOpacity = 0.18,
      saturation = 1.8,
      distortionScale = -180,
      redOffset = 0,
      greenOffset = 10,
      blueOffset = 20,
      xChannel = 'R',
      yChannel = 'G',
      mixBlendMode = 'screen',
      className = '',
      style = {},
      disableRefraction = false,
      onClick,
      ...rest
    },
    forwardedRef
  ) => {
    const rawId = useId();
    const cleanId = rawId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filterId = `refractive-glass-${cleanId}`;
    const redGradId = `red-grad-${cleanId}`;
    const blueGradId = `blue-grad-${cleanId}`;

    const containerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(forwardedRef, () => containerRef.current as HTMLDivElement);

    const imageRef = useRef<SVGFEImageElement | null>(null);
    const redDisplaceRef = useRef<SVGFEDisplacementMapElement | null>(null);
    const greenDisplaceRef = useRef<SVGFEDisplacementMapElement | null>(null);
    const blueDisplaceRef = useRef<SVGFEDisplacementMapElement | null>(null);
    const blurRef = useRef<SVGFEGaussianBlurElement | null>(null);

    const [isMounted, setIsMounted] = useState(false);
    const [isGestureActive, setIsGestureActive] = useState(false);

    // Feature detect whether backdrop-filter with SVG url() is supported.
    // SVG displacement maps in CSS backdrop-filter lack native GPU compositing in Blink/Chromium
    // and trigger severe GPU TDR resets (Event 141) on modern high-DPI displays.
    // We intentionally route through the high-performance GPU-composited blur path.
    const isSvgBackdropSupported = false;

    const shouldUseRefraction = isSvgBackdropSupported && !disableRefraction && !isGestureActive;

    // Check if parent window or document has an active drag gesture
    useEffect(() => {
      const checkGesture = () => {
        const hasGesture = containerRef.current?.closest('[data-gesture="active"]') !== null;
        setIsGestureActive(hasGesture);
      };

      checkGesture();
      const observer = new MutationObserver(checkGesture);
      if (containerRef.current?.parentElement) {
        observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-gesture'] });
      }
      return () => observer.disconnect();
    }, []);

    // Generate the SVG displacement map on dimension updates
    const updateDisplacementMap = () => {
      const el = containerRef.current;
      if (!el || !imageRef.current) return;

      const rect = el.getBoundingClientRect();
      const rawW = rect.width || 880;
      const rawH = rect.height || 56;

      // Quantize to steps to prevent rebuilding textures on micro-pixel layout passes
      const w = Math.max(QUANTIZE_STEP, Math.round(rawW / QUANTIZE_STEP) * QUANTIZE_STEP);
      const h = Math.max(QUANTIZE_STEP, Math.round(rawH / QUANTIZE_STEP) * QUANTIZE_STEP);

      const inset = 0.5 * borderWidth * Math.min(w, h);

      const svgContent = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="red"/>
            </linearGradient>
            <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0000"/>
              <stop offset="100%" stop-color="blue"/>
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="${w}" height="${h}" fill="black"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${redGradId})"/>
          <rect x="0" y="0" width="${w}" height="${h}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}"/>
          <rect x="${inset}" y="${inset}" width="${Math.max(0, w - 2 * inset)}" height="${Math.max(0, h - 2 * inset)}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/>
        </svg>
      `;

      const dataUri = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
      imageRef.current.setAttribute('href', dataUri);
      imageRef.current.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUri);

      // Update multi-channel scale parameters
      if (redDisplaceRef.current) {
        redDisplaceRef.current.setAttribute('scale', (distortionScale + redOffset).toString());
        redDisplaceRef.current.setAttribute('xChannelSelector', xChannel);
        redDisplaceRef.current.setAttribute('yChannelSelector', yChannel);
      }
      if (greenDisplaceRef.current) {
        greenDisplaceRef.current.setAttribute('scale', (distortionScale + greenOffset).toString());
        greenDisplaceRef.current.setAttribute('xChannelSelector', xChannel);
        greenDisplaceRef.current.setAttribute('yChannelSelector', yChannel);
      }
      if (blueDisplaceRef.current) {
        blueDisplaceRef.current.setAttribute('scale', (distortionScale + blueOffset).toString());
        blueDisplaceRef.current.setAttribute('xChannelSelector', xChannel);
        blueDisplaceRef.current.setAttribute('yChannelSelector', yChannel);
      }
      if (blurRef.current) {
        blurRef.current.setAttribute('stdDeviation', displace.toString());
      }
    };

    useLayoutEffect(() => {
      setIsMounted(true);
      if (shouldUseRefraction) {
        updateDisplacementMap();
      }
    }, [shouldUseRefraction]);

    // Schedule map generation on resize or parameter updates
    useEffect(() => {
      if (!isMounted || !shouldUseRefraction) return;

      const schedule = () => {
        requestAnimationFrame(updateDisplacementMap);
      };

      schedule();

      const el = containerRef.current;
      if (!el) return;

      const resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(el);
      return () => resizeObserver.disconnect();
    }, [
      isMounted,
      width,
      height,
      borderRadius,
      borderWidth,
      brightness,
      opacity,
      blur,
      displace,
      distortionScale,
      redOffset,
      greenOffset,
      blueOffset,
      xChannel,
      yChannel,
      mixBlendMode,
      disableRefraction,
    ]);

    const computedStyle: CSSProperties = useMemo(() => {
      const base: CSSProperties = {
        ...style,
        ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
        ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
        borderRadius: `${borderRadius}px`,
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        overflow: 'hidden',
      };

      if (shouldUseRefraction) {
        return {
          ...base,
          background: `rgba(0, 0, 0, ${backgroundOpacity})`,
          backdropFilter: `url(#${filterId}) saturate(${saturation})`,
          WebkitBackdropFilter: `url(#${filterId}) saturate(${saturation})`,
          boxShadow: `
            inset 0 0 0 0.5px rgba(255, 255, 255, 0.25),
            inset 0 1px 1.5px rgba(255, 255, 255, 0.40),
            0 20px 48px -8px rgba(0, 0, 0, 0.55),
            0 6px 18px rgba(0, 0, 0, 0.3)
          `,
        };
      }

      // High-performance fallback: GPU-accelerated standard dark blur
      return {
        ...base,
        background: 'rgba(16, 18, 24, 0.85)',
        backdropFilter: 'blur(16px) saturate(160%)',
        WebkitBackdropFilter: 'blur(16px) saturate(160%)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        boxShadow: `
          inset 0 0.5px 0.5px rgba(255, 255, 255, 0.20),
          0 16px 40px rgba(0, 0, 0, 0.45),
          0 4px 12px rgba(0, 0, 0, 0.25)
        `,
      };
    }, [
      style,
      width,
      height,
      borderRadius,
      shouldUseRefraction,
      backgroundOpacity,
      filterId,
      saturation,
    ]);

    return (
      <div
        ref={containerRef}
        className={`relative flex items-center justify-center transition-all duration-200 select-none ${className}`}
        style={computedStyle}
        onClick={onClick}
        {...rest}
      >
        {/* SVG Filter Pipeline definition */}
        <svg
          className="w-full h-full pointer-events-none absolute inset-0 opacity-0 -z-10"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ transform: 'translateZ(0)' }}
        >
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
              <feImage ref={imageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

              {/* Red Channel Dispersion */}
              <feDisplacementMap
                ref={redDisplaceRef}
                in="SourceGraphic"
                in2="map"
                scale={distortionScale + redOffset}
                xChannelSelector={xChannel}
                yChannelSelector={yChannel}
                id="redchannel"
                result="dispRed"
              />
              <feColorMatrix
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="red"
              />

              {/* Green Channel Dispersion */}
              <feDisplacementMap
                ref={greenDisplaceRef}
                in="SourceGraphic"
                in2="map"
                scale={distortionScale + greenOffset}
                xChannelSelector={xChannel}
                yChannelSelector={yChannel}
                id="greenchannel"
                result="dispGreen"
              />
              <feColorMatrix
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="green"
              />

              {/* Blue Channel Dispersion */}
              <feDisplacementMap
                ref={blueDisplaceRef}
                in="SourceGraphic"
                in2="map"
                scale={distortionScale + blueOffset}
                xChannelSelector={xChannel}
                yChannelSelector={yChannel}
                id="bluechannel"
                result="dispBlue"
              />
              <feColorMatrix
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="blue"
              />

              {/* Additive Screen Blend with smooth Gaussian dispersion */}
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="output" />
              <feGaussianBlur ref={blurRef} in="output" stdDeviation={displace} />
            </filter>
          </defs>
        </svg>

        {/* Content layer matching container dimensions */}
        <div className="w-full h-full rounded-[inherit] relative z-10" style={{ pointerEvents: 'auto' }}>
          {children}
        </div>
      </div>
    );
  }
);

RefractiveGlass.displayName = 'RefractiveGlass';
