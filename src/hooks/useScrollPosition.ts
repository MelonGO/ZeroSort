import { useStore } from "@/store/useStore";
import { type RefObject, useCallback, useEffect, useRef } from "react";

interface UseScrollPositionProps {
  /** Current note ID to track scroll for */
  noteId: string | undefined;
  /** Ref to the scrollable container element */
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Manages per-note scroll position save/restore when switching between notes.
 */
export function useScrollPosition({
  noteId,
  containerRef,
}: UseScrollPositionProps) {
  const prevNoteIdRef = useRef<string | undefined>(undefined);
  const scrollTopRef = useRef(0);
  const setNoteScrollPosition = useStore(
    (state) => state.setNoteScrollPosition,
  );

  // Track latest scroll position in a ref so it survives after the DOM ref is cleared on unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      scrollTopRef.current = container.scrollTop;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  /**
   * Detects whether a note switch occurred and saves the outgoing note's scroll position.
   * Only saves if the outgoing note is still open (hidden, not closed).
   * Returns `true` if the note changed.
   */
  const handleNoteSwitch = useCallback(
    (newNoteId: string | undefined): boolean => {
      const isSwitch = prevNoteIdRef.current !== newNoteId;
      if (isSwitch && prevNoteIdRef.current && containerRef.current) {
        const isStillOpen = useStore
          .getState()
          .openNoteIds.includes(prevNoteIdRef.current);
        if (isStillOpen) {
          setNoteScrollPosition(
            prevNoteIdRef.current,
            containerRef.current.scrollTop,
          );
        }
      }
      prevNoteIdRef.current = newNoteId;
      return isSwitch;
    },
    [setNoteScrollPosition, containerRef],
  );

  /** Restores the saved scroll position for the given note ID. */
  const restoreScroll = useCallback(
    (targetNoteId: string) => {
      if (containerRef.current) {
        containerRef.current.scrollTop =
          useStore.getState().noteScrollPositions[targetNoteId] || 0;
      }
    },
    [containerRef],
  );

  /** Preserves and then restores the current scroll offset (for same-note content updates). */
  const preserveScroll = useCallback(
    (savedTop: number) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = savedTop;
      }
    },
    [containerRef],
  );

  /** Returns the current scroll top of the container. */
  const getCurrentScrollTop = useCallback((): number => {
    return containerRef.current?.scrollTop ?? 0;
  }, [containerRef]);

  // Save scroll position on unmount — uses scrollTopRef since containerRef.current is already null during useEffect cleanup
  useEffect(() => {
    return () => {
      if (noteId) {
        const isStillOpen = useStore.getState().openNoteIds.includes(noteId);
        if (isStillOpen) {
          setNoteScrollPosition(noteId, scrollTopRef.current);
        }
      }
    };
  }, [noteId, setNoteScrollPosition]);

  return {
    handleNoteSwitch,
    restoreScroll,
    preserveScroll,
    getCurrentScrollTop,
  };
}
