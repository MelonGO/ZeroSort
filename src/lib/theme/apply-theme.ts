import type {
  ThemeEditorState,
  ThemeStyleProps,
  ThemeStyles,
} from "@/types/theme";
import { applyStyleToElement } from "./apply-style-to-element";
import { colorFormatter } from "./color-converter";
import { COMMON_STYLES } from "./config";
import { setShadowVariables } from "./shadows";

type Mode = "dark" | "light";

const updateThemeClass = (root: HTMLElement, mode: Mode) => {
  if (mode === "light") {
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
  }
};

const applyCommonStyles = (root: HTMLElement, themeStyles: ThemeStyleProps) => {
  Object.entries(themeStyles)
    .filter(([key]) => COMMON_STYLES.includes(key))
    .forEach(([key, value]) => {
      if (typeof value === "string") {
        applyStyleToElement(root, key, value);
      }
    });
};

const applyThemeColors = (
  root: HTMLElement,
  themeStyles: ThemeStyles,
  mode: Mode,
) => {
  Object.entries(themeStyles[mode]).forEach(([key, value]) => {
    if (typeof value === "string" && !COMMON_STYLES.includes(key)) {
      const hslValue = colorFormatter(value, "hsl", "4");
      applyStyleToElement(root, key, hslValue);
    }
  });
};

/** Applies the full theme state to an HTML element (typically document.documentElement). */
export const applyThemeToElement = (
  themeState: ThemeEditorState,
  rootElement: HTMLElement,
) => {
  const { currentMode: mode, styles: themeStyles } = themeState;
  if (!rootElement) return;

  updateThemeClass(rootElement, mode);
  applyCommonStyles(rootElement, themeStyles.light);
  applyThemeColors(rootElement, themeStyles, mode);
  setShadowVariables(themeState);
};
