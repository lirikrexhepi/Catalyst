import React, { forwardRef, useImperativeHandle } from 'react';
import { LiquidGlassProps, LiquidGlassVariant } from './types';
import { useLiquidGlass } from './useLiquidGlass';

function getVariantDefaults(variant?: LiquidGlassVariant): Partial<LiquidGlassProps> {
  switch (variant) {
    case 'capsule':
      return {
        radius: 'full',
        bezelWidth: 20,
        glassThickness: 35,
        refractionScale: 1.0,
        blur: 0.5,
        frost: 16,
        specularOpacity: 0.45,
        tint: 'rgba(18, 20, 26, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        shadow: 'apple',
      };
    case 'button':
      return {
        radius: 12,
        bezelWidth: 14,
        glassThickness: 28,
        refractionScale: 0.9,
        blur: 0.4,
        frost: 12,
        specularOpacity: 0.4,
        tint: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        shadow: 'subtle',
        interactive: true,
      };
    case 'toolbar':
      return {
        radius: 18,
        bezelWidth: 22,
        glassThickness: 38,
        refractionScale: 1.0,
        blur: 0.6,
        frost: 16,
        specularOpacity: 0.4,
        tint: 'rgba(18, 20, 26, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        shadow: 'elevated',
      };
    case 'card':
      return {
        radius: 20,
        bezelWidth: 24,
        glassThickness: 40,
        refractionScale: 0.95,
        blur: 0.5,
        frost: 14,
        specularOpacity: 0.35,
        tint: 'rgba(20, 22, 28, 0.70)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        shadow: 'apple',
      };
    case 'input':
      return {
        radius: 14,
        bezelWidth: 16,
        glassThickness: 24,
        refractionScale: 0.8,
        blur: 0.4,
        frost: 14,
        specularOpacity: 0.3,
        tint: 'rgba(18, 20, 26, 0.90)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        shadow: 'subtle',
      };
    case 'panel':
    default:
      return {
        radius: 24,
        bezelWidth: 28,
        glassThickness: 45,
        refractionScale: 1.0,
        blur: 0.5,
        frost: 16,
        specularOpacity: 0.4,
        tint: 'rgba(18, 20, 26, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        shadow: 'apple',
      };
  }
}

/**
 * Reusable Liquid Glass component matching Apple / Figma refraction optics.
 * Renders physical refraction with SVG Displacement Maps + Specular highlight blooms.
 */
export const LiquidGlass = forwardRef<HTMLDivElement, LiquidGlassProps>(
  (rawProps, forwardedRef) => {
    const variantDefaults = getVariantDefaults(rawProps.variant);
    const props = { ...variantDefaults, ...rawProps };

    const {
      variant = 'panel',
      surface = 'squircle',
      radius,
      bezelWidth,
      glassThickness,
      baseThickness,
      refractionScale,
      blur,
      frost,
      frostSaturation,
      specularOpacity,
      specularSaturation,
      lightAngle,
      lightElevation,
      tint,
      darkTint,
      border,
      shadow,
      interactive,
      chromaticAberration,
      disableRefraction,
      className = '',
      style = {},
      children,
      ...rest
    } = props;

    const { ref: internalRef, specularStyle, containerStyle } = useLiquidGlass({
      surface,
      radius,
      bezelWidth,
      glassThickness,
      baseThickness,
      refractionScale,
      blur,
      frost,
      frostSaturation,
      specularOpacity,
      specularSaturation,
      lightAngle,
      lightElevation,
      tint,
      border,
      shadow,
      disableRefraction,
    });

    useImperativeHandle(forwardedRef, () => internalRef.current as HTMLDivElement);

    const isInteractive = interactive ?? variant === 'button';

    const mergedStyle: React.CSSProperties = React.useMemo(
      () => ({
        ...containerStyle,
        ...(isInteractive
          ? {
              cursor: 'pointer',
              transition:
                'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
            }
          : {}),
        ...style,
      }),
      [containerStyle, isInteractive, style]
    );

    return (
      <div
        ref={internalRef}
        className={`liquid-glass-container select-none ${
          isInteractive ? 'hover:scale-[1.015] active:scale-[0.985]' : ''
        } ${className}`}
        style={mergedStyle}
        {...rest}
      >
        {/* Bezel highlight, composited rather than filtered. */}
        {specularStyle && <div aria-hidden="true" className="liquid-glass-specular" style={specularStyle} />}

        {/* Inner content layer */}
        <div
          className="liquid-glass-content relative z-10 w-full h-full"
          style={{ pointerEvents: 'auto' }}
        >
          {children}
        </div>
      </div>
    );
  }
);

LiquidGlass.displayName = 'LiquidGlass';
