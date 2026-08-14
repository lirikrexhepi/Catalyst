import React, { forwardRef, useImperativeHandle } from 'react';
import { LiquidGlassProps, LiquidGlassVariant } from './types';
import { useLiquidGlass } from './useLiquidGlass';
import { LiquidGlassFilter } from './LiquidGlassFilter';

function getVariantDefaults(variant?: LiquidGlassVariant): Partial<LiquidGlassProps> {
  switch (variant) {
    case 'capsule':
      return {
        radius: 'full',
        bezelWidth: 20,
        glassThickness: 35,
        refractionScale: 1.0,
        blur: 0.5,
        frost: 6,
        specularOpacity: 0.45,
        tint: 'rgba(255, 255, 255, 0.08)',
        shadow: 'apple',
      };
    case 'button':
      return {
        radius: 12,
        bezelWidth: 14,
        glassThickness: 28,
        refractionScale: 0.9,
        blur: 0.4,
        frost: 5,
        specularOpacity: 0.5,
        tint: 'rgba(255, 255, 255, 0.12)',
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
        frost: 7,
        specularOpacity: 0.4,
        tint: 'rgba(255, 255, 255, 0.07)',
        shadow: 'elevated',
      };
    case 'card':
      return {
        radius: 20,
        bezelWidth: 24,
        glassThickness: 40,
        refractionScale: 0.95,
        blur: 0.5,
        frost: 6,
        specularOpacity: 0.35,
        tint: 'rgba(255, 255, 255, 0.06)',
        shadow: 'apple',
      };
    case 'input':
      return {
        radius: 14,
        bezelWidth: 16,
        glassThickness: 24,
        refractionScale: 0.8,
        blur: 0.4,
        frost: 5,
        specularOpacity: 0.3,
        tint: 'rgba(255, 255, 255, 0.09)',
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
        frost: 7,
        specularOpacity: 0.4,
        tint: 'rgba(255, 255, 255, 0.08)',
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

    const { ref: internalRef, filterProps, containerStyle } = useLiquidGlass({
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
      <>
        {/* Invisible SVG filter graph definitions */}
        <LiquidGlassFilter {...filterProps} />

        {/* Liquid Glass container */}
        <div
          ref={internalRef}
          className={`liquid-glass-container select-none ${
            isInteractive ? 'hover:scale-[1.015] active:scale-[0.985]' : ''
          } ${className}`}
          style={mergedStyle}
          {...rest}
        >
          {/* Inner content layer */}
          <div
            className="liquid-glass-content relative z-10 w-full h-full"
            style={{ pointerEvents: 'auto' }}
          >
            {children}
          </div>
        </div>
      </>
    );
  }
);

LiquidGlass.displayName = 'LiquidGlass';
