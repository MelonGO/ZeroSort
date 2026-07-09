import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Hook to track mouse down state on an element using useSyncExternalStore.
 * Listens for mousedown on the element and mouseup on document.
 */
export function useMouseDown(element: HTMLElement | null) {
  const isDownRef = useRef(false);

  const subscribe = useCallback(
    (callback: () => void) => {
      if (!element) return () => {};

      const handleDown = () => {
        isDownRef.current = true;
        callback();
      };
      const handleUp = () => {
        isDownRef.current = false;
        callback();
      };

      element.addEventListener("mousedown", handleDown);
      document.addEventListener("mouseup", handleUp);
      return () => {
        element.removeEventListener("mousedown", handleDown);
        document.removeEventListener("mouseup", handleUp);
      };
    },
    [element],
  );

  const getSnapshot = useCallback(() => isDownRef.current, []);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
