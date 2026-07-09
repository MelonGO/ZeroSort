import { useThemeStore } from "@/store/useThemeStore";

/** Returns whether the active resolved theme mode is dark. */
export function useIsDarkTheme() {
  return useThemeStore((state) => state.themeState.currentMode === "dark");
}
