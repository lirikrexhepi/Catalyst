import React from 'react';
import { DisplacementMapResult } from './types';

export interface LiquidGlassFilterProps {
  filterId: string;
  mapResult: DisplacementMapResult | null;
  blur?: number;
  refractionScale?: number;
  specularOpacity?: number;
  specularSaturation?: number;
}

/**
 * Renders the SVG filter graph matching Apple & Kube.io's Liquid Glass spec:
 * 1. feGaussianBlur (smooth backdrop defocus)
 * 2. feImage (displacement map filling 100% of the element)
 * 3. feDisplacementMap (optical ray shift via R/G channels)
 * 4. feColorMatrix (saturate colors in refracted light)
 * 5. feImage (specular reflection map)
 * 6. feComposite (mask saturation to specular rims)
 * 7. feComponentTransfer (specular alpha tuning)
 * 8. feBlend (chain blends over displaced backdrop)
 */
const LiquidGlassFilterImpl: React.FC<LiquidGlassFilterProps> = ({
  filterId,
  mapResult,
  blur = 0.5,
  refractionScale = 1.0,
  specularOpacity = 0.4,
  specularSaturation = 6,
}) => {
  if (!mapResult || !mapResult.displacementMapUrl) {
    return null;
  }

  const { displacementMapUrl, specularMapUrl, maxDisplacement, width, height } = mapResult;
  const effectiveScale = maxDisplacement * refractionScale;

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
      colorInterpolationFilters="sRGB"
    >
      <defs>
        <filter
          id={filterId}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          {/* Defocus background slightly */}
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={Math.max(0, blur)}
            result="blurred_source"
          />

          {/* Load Refraction Displacement Map */}
          <feImage
            href={displacementMapUrl}
            x="0"
            y="0"
            width={width}
            height={height}
            result="displacement_map"
            preserveAspectRatio="none"
          />

          {/* Displace pixels along normal vectors */}
          <feDisplacementMap
            in="blurred_source"
            in2="displacement_map"
            xChannelSelector="R"
            yChannelSelector="G"
            scale={effectiveScale}
            result="displaced"
          />

          {/* Color Saturation boost on highlights/refraction */}
          <feColorMatrix
            in="displaced"
            type="saturate"
            values={`${Math.max(1, specularSaturation)}`}
            result="displaced_saturated"
          />

          {/* Load Specular Reflection Map */}
          <feImage
            href={specularMapUrl}
            x="0"
            y="0"
            width={width}
            height={height}
            result="specular_layer"
            preserveAspectRatio="none"
          />

          {/* Mask saturated image with specular highlights */}
          <feComposite
            in="displaced_saturated"
            in2="specular_layer"
            operator="in"
            result="specular_saturated"
          />

          {/* Modulate specular opacity */}
          <feComponentTransfer in="specular_layer" result="specular_faded">
            <feFuncA type="linear" slope={Math.max(0, Math.min(1, specularOpacity))} />
          </feComponentTransfer>

          {/* Blend saturated reflection into displaced image */}
          <feBlend
            in="specular_saturated"
            in2="displaced"
            mode="normal"
            result="withSaturation"
          />

          {/* Blend final faded specular highlight */}
          <feBlend in="specular_faded" in2="withSaturation" mode="normal" />
        </filter>
      </defs>
    </svg>
  );
};

// The filter graph only changes when the generated maps or optical parameters change, so
// re-rendering it on unrelated parent updates would rebuild the SVG filter for nothing.
export const LiquidGlassFilter = React.memo(LiquidGlassFilterImpl);
LiquidGlassFilter.displayName = 'LiquidGlassFilter';
