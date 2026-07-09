import { useEffect, useState } from "react";

/**
 * Custom hook to detect if the screen width is above a certain breakpoint.
 * Default breakpoint is 768px (md: in Tailwind).
 */
export function useIsLargeScreen(breakpoint = 768) {
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsLargeScreen(event.matches);
    };

    setIsLargeScreen(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [breakpoint]);

  return isLargeScreen;
}
