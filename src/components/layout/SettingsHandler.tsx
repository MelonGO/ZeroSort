import { applyThemeToElement } from "@/lib/theme/apply-theme";
import { useStore } from "@/store/useStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useEffect } from "react";

/**
 * A headless component that listens to store changes and applies global settings.
 * Handles theme switching (with preset support and View Transition API) and interface scaling.
 *
 * @returns null - This component does not render any UI.
 */
export function SettingsHandler() {
  const theme = useStore((state) => state.theme);
  const interfaceScale = useStore((state) => state.interfaceScale);
  const themeState = useThemeStore((state) => state.themeState);
  const setThemeState = useThemeStore((state) => state.setThemeState);

  // Sync "system" / "light" / "dark" mode preference into the theme store's currentMode
  useEffect(() => {
    const resolveMode = (): "light" | "dark" => {
      if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
      return theme;
    };

    const resolvedMode = resolveMode();
    if (themeState.currentMode !== resolvedMode) {
      setThemeState({ ...themeState, currentMode: resolvedMode });
    }

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        const newMode = mediaQuery.matches ? "dark" : "light";
        const current = useThemeStore.getState().themeState;
        if (current.currentMode !== newMode) {
          useThemeStore
            .getState()
            .setThemeState({ ...current, currentMode: newMode });
        }
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Apply full theme (CSS variables, .dark class, shadows) whenever themeState changes
  useEffect(() => {
    const root = document.documentElement;
    applyThemeToElement(themeState, root);
  }, [themeState]);

  // Handle Interface Scale
  useEffect(() => {
    const root = window.document.documentElement;
    root.style.fontSize = `${interfaceScale}%`;
  }, [interfaceScale]);

  return null;
}
