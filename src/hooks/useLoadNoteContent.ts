import { useStore } from "@/store/useStore";
import { useEffect, useRef, useState } from "react";

/**
 * Loads note content on demand with cancellation and stale-request protection.
 */
export function useLoadNoteContent(
  noteId: string | null,
  isContentLoaded: boolean,
): boolean {
  const loadNoteContent = useStore((state) => state.loadNoteContent);
  const [isLoading, setIsLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!noteId || isContentLoaded) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++requestRef.current;
    const requestedNoteId = noteId;

    setIsLoading(true);

    void (async () => {
      try {
        await loadNoteContent(requestedNoteId);
      } catch (error) {
        console.error("Failed to load note content:", error);
      } finally {
        if (
          !cancelled &&
          requestRef.current === requestId &&
          useStore.getState().selectedNoteId === requestedNoteId
        ) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadNoteContent, isContentLoaded, noteId]);

  return isLoading;
}
