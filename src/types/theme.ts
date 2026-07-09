import { z } from "zod";

/** Supported color output formats for theme color conversion. */
export type ColorFormat = "hsl" | "rgb" | "oklch" | "hex";

export const themeStylePropsSchema = z.object({
  background: z.string().describe("The default background color."),
  foreground: z.string().describe("Paired with background."),
  card: z.string().describe("The background color for cards."),
  "card-foreground": z.string().describe("Paired with card."),
  popover: z.string().describe("The background color for popovers."),
  "popover-foreground": z.string().describe("Paired with popover."),
  primary: z.string().describe("The main color."),
  "primary-foreground": z.string().describe("Paired with primary."),
  secondary: z.string().describe("A secondary color."),
  "secondary-foreground": z.string().describe("Paired with secondary."),
  muted: z.string().describe("A muted background color."),
  "muted-foreground": z.string().describe("Paired with muted."),
  accent: z.string().describe("Subtle color for hover or highlight."),
  "accent-foreground": z.string().describe("Paired with accent."),
  destructive: z.string().describe("Color for destructive actions."),
  "destructive-foreground": z.string().describe("Paired with destructive."),
  border: z.string().describe("The color for borders."),
  input: z.string().describe("The background color for input fields."),
  ring: z.string().describe("The color for focus rings."),
  "chart-1": z.string(),
  "chart-2": z.string(),
  "chart-3": z.string(),
  "chart-4": z.string(),
  "chart-5": z.string(),
  sidebar: z.string().describe("The background color for the sidebar."),
  "sidebar-foreground": z.string().describe("Paired with sidebar."),
  "sidebar-primary": z
    .string()
    .describe("The primary color for sidebar elements."),
  "sidebar-primary-foreground": z
    .string()
    .describe("Paired with sidebar-primary."),
  "sidebar-accent": z.string().describe("An accent color for the sidebar."),
  "sidebar-accent-foreground": z
    .string()
    .describe("Paired with sidebar-accent."),
  "sidebar-border": z
    .string()
    .describe("The color for borders within the sidebar."),
  "sidebar-ring": z
    .string()
    .describe("The color for focus rings within the sidebar."),
  "font-sans": z.string().describe("Primary UI font."),
  "font-serif": z.string().describe("The preferred serif font family."),
  "font-mono": z.string().describe("The preferred monospace font family."),
  radius: z.string().describe("The global border-radius for components."),
  "shadow-color": z.string(),
  "shadow-opacity": z.string(),
  "shadow-blur": z.string(),
  "shadow-spread": z.string(),
  "shadow-offset-x": z.string(),
  "shadow-offset-y": z.string(),
  "letter-spacing": z.string().describe("The global letter spacing for text."),
  spacing: z.string().optional(),
});

export const themeStylesSchema = z.object({
  light: themeStylePropsSchema,
  dark: themeStylePropsSchema,
});

export type ThemeStyleProps = z.infer<typeof themeStylePropsSchema>;
export type ThemeStyles = z.infer<typeof themeStylesSchema>;

/** State shape for the theme editor / active theme. */
export interface ThemeEditorState {
  /** Name of the currently applied preset */
  preset?: string;
  /** Full light and dark style definitions */
  styles: ThemeStyles;
  /** Currently active mode (light or dark) */
  currentMode: "light" | "dark";
  /** HSL adjustment overrides */
  hslAdjustments?: {
    hueShift: number;
    saturationScale: number;
    lightnessScale: number;
  };
}

/** A built-in or user-saved theme preset. */
export interface ThemePreset {
  source?: "SAVED" | "BUILT_IN";
  createdAt?: string;
  label?: string;
  styles: {
    light: Partial<ThemeStyleProps>;
    dark: Partial<ThemeStyleProps>;
  };
}
