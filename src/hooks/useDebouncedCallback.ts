import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced version of the given callback that delays invocation by the specified milliseconds.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: any[]) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => fn(...args), ms);
    },
    [fn, ms],
  ) as unknown as T;
}
