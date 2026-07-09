import { applyThemeToElement } from "@/lib/theme/apply-theme";
import { COMMON_STYLES, defaultThemeState } from "@/lib/theme/config";
import { useThemeStore } from "@/store/useThemeStore";
import type { ThemeEditorState } from "@/types/theme";
import * as culori from "culori";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { SliderWithInput } from "./SliderWithInput";

/** Adjusts a color by modifying HSL values. */
function adjustColorByHsl(
  color: string,
  hueShift: number,
  saturationScale: number,
  lightnessScale: number,
): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hsl = culori.converter("hsl")(color as any) as {
      h?: number;
      s?: number;
      l?: number;
    };
    const h = hsl?.h;
    const s = hsl?.s;
    const l = hsl?.l;

    if (h === undefined || s === undefined || l === undefined) {
      return color;
    }

    const adjusted = {
      mode: "hsl" as const,
      h: (((h + hueShift) % 360) + 360) % 360,
      s: Math.min(1, Math.max(0, s * saturationScale)),
      l: Math.min(1, Math.max(0.1, l * lightnessScale)),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return culori.formatHex(adjusted as any) ?? color;
  } catch {
    return color;
  }
}

interface HslAdjustmentControlsProps {
  onCustomChange?: () => void;
}

/** Three HSL sliders for bulk color adjustments. */
function HslAdjustmentControls({ onCustomChange }: HslAdjustmentControlsProps) {
  const themeState = useThemeStore((s) => s.themeState);
  const setThemeState = useThemeStore((s) => s.setThemeState);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentHslAdjustments = useMemo(
    () => themeState.hslAdjustments ?? defaultThemeState.hslAdjustments!,
    [themeState.hslAdjustments],
  );

  // Store the "original" styles before HSL adjustments were applied
  const baseStylesRef = useRef(themeState.styles);

  // Reset base styles when HSL adjustments are at defaults
  useEffect(() => {
    const defaults = defaultThemeState.hslAdjustments!;
    if (
      currentHslAdjustments.hueShift === defaults.hueShift &&
      currentHslAdjustments.saturationScale === defaults.saturationScale &&
      currentHslAdjustments.lightnessScale === defaults.lightnessScale
    ) {
      baseStylesRef.current = themeState.styles;
    }
  }, [currentHslAdjustments, themeState.styles]);

  const applyHslAdjustments = useCallback(
    (adjustments: ThemeEditorState["hslAdjustments"]) => {
      const {
        hueShift = 0,
        saturationScale = 1,
        lightnessScale = 1,
      } = adjustments ?? {};

      const baseStyles = baseStylesRef.current;

      const adjustStyles = (
        styles: Record<string, string>,
      ): Record<string, string> => {
        const adjusted: Record<string, string> = {};
        for (const [key, value] of Object.entries(styles)) {
          if (COMMON_STYLES.includes(key)) {
            adjusted[key] = value;
          } else {
            adjusted[key] = adjustColorByHsl(
              value,
              hueShift,
              saturationScale,
              lightnessScale,
            );
          }
        }
        return adjusted;
      };

      const newState: ThemeEditorState = {
        ...themeState,
        hslAdjustments: adjustments,
        styles: {
          light: {
            ...baseStyles.light,
            ...adjustStyles(baseStyles.light),
          },
          dark: {
            ...baseStyles.dark,
            ...adjustStyles(baseStyles.dark),
          },
        },
      };

      setThemeState(newState);
      applyThemeToElement(newState, document.documentElement);
      onCustomChange?.();
    },
    [themeState, setThemeState, onCustomChange],
  );

  const handleChange = useCallback(
    (
      property: keyof NonNullable<ThemeEditorState["hslAdjustments"]>,
      value: number,
    ) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        applyHslAdjustments({
          ...currentHslAdjustments,
          [property]: value,
        });
      }, 10);
    },
    [currentHslAdjustments, applyHslAdjustments],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div>
      <SliderWithInput
        value={currentHslAdjustments.hueShift}
        onChange={(value) => handleChange("hueShift", value)}
        unit="deg"
        min={-180}
        max={180}
        step={1}
        label="Hue Shift"
      />
      <SliderWithInput
        value={currentHslAdjustments.saturationScale}
        onChange={(value) => handleChange("saturationScale", value)}
        unit="x"
        min={0}
        max={2}
        step={0.01}
        label="Saturation Multiplier"
      />
      <SliderWithInput
        value={currentHslAdjustments.lightnessScale}
        onChange={(value) => handleChange("lightnessScale", value)}
        unit="x"
        min={0.2}
        max={2}
        step={0.01}
        label="Lightness Multiplier"
      />
    </div>
  );
}

export { HslAdjustmentControls };
