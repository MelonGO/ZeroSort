import type { ThemeEditorState } from "@/types/theme";

/** Properties shared between light and dark modes (use light mode value for both). */
export const COMMON_STYLES = [
  "font-sans",
  "font-serif",
  "font-mono",
  "radius",
  "shadow-opacity",
  "shadow-blur",
  "shadow-spread",
  "shadow-offset-x",
  "shadow-offset-y",
  "letter-spacing",
  "spacing",
];

export const DEFAULT_FONT_SANS =
  '"Geist Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

export const DEFAULT_FONT_SERIF =
  'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

export const DEFAULT_FONT_MONO =
  '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const defaultLightThemeStyles = {
  background: "oklch(0.99 0 0)",
  foreground: "oklch(0 0 0)",
  card: "oklch(1.00 0 0)",
  "card-foreground": "oklch(0 0 0)",
  popover: "oklch(0.99 0 0)",
  "popover-foreground": "oklch(0 0 0)",
  primary: "oklch(0 0 0)",
  "primary-foreground": "oklch(1.00 0 0)",
  secondary: "oklch(0.94 0 0)",
  "secondary-foreground": "oklch(0 0 0)",
  muted: "oklch(0.97 0 0)",
  "muted-foreground": "oklch(0.44 0 0)",
  accent: "oklch(0.94 0 0)",
  "accent-foreground": "oklch(0 0 0)",
  destructive: "oklch(0.63 0.19 23.03)",
  "destructive-foreground": "oklch(1.00 0 0)",
  border: "oklch(0.92 0 0)",
  input: "oklch(0.94 0 0)",
  ring: "oklch(0 0 0)",
  "chart-1": "oklch(0.81 0.17 75.35)",
  "chart-2": "oklch(0.55 0.22 264.53)",
  "chart-3": "oklch(0.72 0 0)",
  "chart-4": "oklch(0.92 0 0)",
  "chart-5": "oklch(0.56 0 0)",
  sidebar: "oklch(0.99 0 0)",
  "sidebar-foreground": "oklch(0 0 0)",
  "sidebar-primary": "oklch(0 0 0)",
  "sidebar-primary-foreground": "oklch(1.00 0 0)",
  "sidebar-accent": "oklch(0.94 0 0)",
  "sidebar-accent-foreground": "oklch(0 0 0)",
  "sidebar-border": "oklch(0.94 0 0)",
  "sidebar-ring": "oklch(0 0 0)",
  "font-sans": "Geist, sans-serif",
  "font-serif": "Georgia, serif",
  "font-mono": "Geist Mono, monospace",
  radius: "0.5rem",
  "shadow-color": "hsl(0 0% 0%)",
  "shadow-opacity": "0.18",
  "shadow-blur": "2px",
  "shadow-spread": "0px",
  "shadow-offset-x": "0px",
  "shadow-offset-y": "1px",
  "letter-spacing": "0em",
  spacing: "0.25rem",
};

export const defaultDarkThemeStyles = {
  ...defaultLightThemeStyles,
  background: "oklch(0 0 0)",
  foreground: "oklch(1.00 0 0)",
  card: "oklch(0.14 0 0)",
  "card-foreground": "oklch(1.00 0 0)",
  popover: "oklch(0.18 0 0)",
  "popover-foreground": "oklch(1.00 0 0)",
  primary: "oklch(1.00 0 0)",
  "primary-foreground": "oklch(0 0 0)",
  secondary: "oklch(0.25 0 0)",
  "secondary-foreground": "oklch(1.00 0 0)",
  muted: "oklch(0.23 0 0)",
  "muted-foreground": "oklch(0.72 0 0)",
  accent: "oklch(0.32 0 0)",
  "accent-foreground": "oklch(1.00 0 0)",
  destructive: "oklch(0.69 0.20 23.91)",
  "destructive-foreground": "oklch(0 0 0)",
  border: "oklch(0.26 0 0)",
  input: "oklch(0.32 0 0)",
  ring: "oklch(0.72 0 0)",
  "chart-1": "oklch(0.81 0.17 75.35)",
  "chart-2": "oklch(0.58 0.21 260.84)",
  "chart-3": "oklch(0.56 0 0)",
  "chart-4": "oklch(0.44 0 0)",
  "chart-5": "oklch(0.92 0 0)",
  sidebar: "oklch(0.18 0 0)",
  "sidebar-foreground": "oklch(1.00 0 0)",
  "sidebar-primary": "oklch(1.00 0 0)",
  "sidebar-primary-foreground": "oklch(0 0 0)",
  "sidebar-accent": "oklch(0.32 0 0)",
  "sidebar-accent-foreground": "oklch(1.00 0 0)",
  "sidebar-border": "oklch(0.32 0 0)",
  "sidebar-ring": "oklch(0.72 0 0)",
  "font-sans": "Geist, sans-serif",
  "font-serif": "Georgia, serif",
  "font-mono": "Geist Mono, monospace",
  radius: "0.625rem",
  "shadow-color": "oklch(0 0 0)",
  "letter-spacing": "0em",
  spacing: "0.25rem",
};

export const defaultThemeState: ThemeEditorState = {
  styles: {
    light: defaultLightThemeStyles,
    dark: defaultDarkThemeStyles,
  },
  currentMode:
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  hslAdjustments: {
    hueShift: 0,
    saturationScale: 1,
    lightnessScale: 1,
  },
};
