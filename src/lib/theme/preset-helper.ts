import type { ThemeStyles } from "@/types/theme";
import { defaultThemeState } from "./config";
import { defaultPresets } from "./presets";

function mergePresetWithDefaults(presetStyles: {
  light?: Partial<ThemeStyles["light"]>;
  dark?: Partial<ThemeStyles["dark"]>;
}): ThemeStyles {
  const defaultTheme = defaultThemeState.styles;
  return {
    light: {
      ...defaultTheme.light,
      ...(presetStyles.light || {}),
    },
    dark: {
      ...defaultTheme.dark,
      ...(presetStyles.light || {}),
      ...(presetStyles.dark || {}),
    },
  };
}

/** Returns merged theme styles for a preset name, falling back to defaults. */
export function getPresetThemeStyles(name: string): ThemeStyles {
  if (name === "default") {
    return defaultThemeState.styles;
  }

  const preset = defaultPresets[name];
  if (!preset) {
    return defaultThemeState.styles;
  }

  return mergePresetWithDefaults(preset.styles);
}
