import { TimelineManager } from "@/lib/virtualization/TimelineManager";
import { useCallback, useEffect, useRef } from "react";

interface UseTimelineScrollProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  timelineManager: TimelineManager;
  initialHomeScrollPosition: number;
  setHomeScrollPosition: (y: number) => void;
  selectedNoteId: string | null;
  lastSelectedNoteId: string | null;
  isLoading: boolean;
  topContentHeight: number;
}

/**
 * Hook to handle all scroll-related concerns for the timeline dashboard.
 */
export function useTimelineScroll({
  scrollContainerRef,
  timelineManager,
  initialHomeScrollPosition,
  setHomeScrollPosition,
  selectedNoteId,
  lastSelectedNoteId,
  isLoading,
  topContentHeight,
}: UseTimelineScrollProps) {
  // Persistent reference for the current scroll position to preserve state during navigation.
  const currentScrollTopRef = useRef(initialHomeScrollPosition);
  const hasRestoredScrollRef = useRef(false);

  // Track previous state for scrolling to selected notes
  const lastScrolledNoteIdRef = useRef<string | null>(null);
  const prevSelectedNoteIdRef = useRef<string | null>(null);
  // Track whether we're waiting for topContentHeight to settle after closing a note
  const pendingCloseScrollRef = useRef<string | null>(null);

  const syncScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const adjustedScrollTop = Math.max(0, el.scrollTop - topContentHeight);
    timelineManager.scrollTop = adjustedScrollTop;
    currentScrollTopRef.current = adjustedScrollTop;
  }, [timelineManager, scrollContainerRef, topContentHeight]);

  // 1. Sync native scroll to Manager
  const handleScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  // 2. Persist scroll position to global store on unmount
  useEffect(() => {
    return () => {
      setHomeScrollPosition(currentScrollTopRef.current);
    };
  }, [setHomeScrollPosition]);

  // 3. Scroll Restoration Logic
  useEffect(() => {
    if (
      !hasRestoredScrollRef.current &&
      scrollContainerRef.current &&
      timelineManager.bodySectionHeight > 0 &&
      !timelineManager.hasEmptyViewport
    ) {
      scrollContainerRef.current.scrollTo({
        top: initialHomeScrollPosition + topContentHeight,
        behavior: "instant",
      });

      requestAnimationFrame(() => {
        syncScrollState();
      });

      hasRestoredScrollRef.current = true;
    }
  }, [
    initialHomeScrollPosition,
    timelineManager.bodySectionHeight,
    timelineManager.viewportHeight,
    timelineManager.viewportWidth,
    syncScrollState,
    topContentHeight,
  ]);

  // 4. Automatic scrolling to selected or recently closed notes
  useEffect(() => {
    if (isLoading && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
      lastScrolledNoteIdRef.current = "loading";
      prevSelectedNoteIdRef.current = selectedNoteId;
      pendingCloseScrollRef.current = null;
      return;
    }

    const targetId = selectedNoteId || lastSelectedNoteId;

    // Check if we explicitly just selected this note (transitioning from null or another note)
    const isExplicitSelection =
      selectedNoteId && selectedNoteId !== prevSelectedNoteIdRef.current;

    // Detect "note just closed" transition: selectedNoteId went from non-null to null
    const isNoteClose =
      !selectedNoteId && prevSelectedNoteIdRef.current !== null;

    prevSelectedNoteIdRef.current = selectedNoteId;

    // When a note is closed, the DOM transitions from a spacer div (height = bodySectionHeight)
    // to the actual HomeHeader + TimelineBody. topContentHeight needs time to settle from the
    // spacer height to the real header height. Defer the scroll until that happens.
    if (isNoteClose && targetId) {
      pendingCloseScrollRef.current = targetId;
      // Don't scroll yet — wait for topContentHeight to update (effect will re-run)
      return;
    }

    // Handle deferred scroll after note close once topContentHeight has settled.
    // The spacer height equals bodySectionHeight which is typically much larger than the
    // real header height, so we wait until topContentHeight is a reasonable header size.
    if (pendingCloseScrollRef.current) {
      const pendingId = pendingCloseScrollRef.current;

      // topContentHeight is still the old spacer value — wait for the next update
      if (topContentHeight > 500) {
        return;
      }

      pendingCloseScrollRef.current = null;

      if (scrollContainerRef.current && timelineManager.bodySectionHeight > 0) {
        requestAnimationFrame(() => {
          const y = timelineManager.getScrollPositionForNote(pendingId);
          if (y >= 0 && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({
              top: y + topContentHeight,
              behavior: "instant",
            });

            requestAnimationFrame(() => {
              syncScrollState();
            });

            lastScrolledNoteIdRef.current = pendingId;
          }
        });
      }
      return;
    }

    if (targetId && scrollContainerRef.current) {
      if (timelineManager.bodySectionHeight === 0) return;

      // Skip redundant scrolls if the target haven't changed since the last scroll
      // UNLESS it's a fresh selection action
      if (targetId === lastScrolledNoteIdRef.current && !isExplicitSelection)
        return;

      const timer = setTimeout(() => {
        const y = timelineManager.getScrollPositionForNote(targetId);
        if (y >= 0) {
          scrollContainerRef.current?.scrollTo({
            top: y + topContentHeight,
            behavior: "instant",
          });

          requestAnimationFrame(() => {
            syncScrollState();
          });

          lastScrolledNoteIdRef.current = targetId;
        }
      }, 50);

      return () => clearTimeout(timer);
    } else {
      lastScrolledNoteIdRef.current = null;
    }
  }, [
    selectedNoteId,
    lastSelectedNoteId,
    timelineManager.bodySectionHeight,
    isLoading,
    syncScrollState,
    topContentHeight,
  ]);

  return { handleScroll };
}
