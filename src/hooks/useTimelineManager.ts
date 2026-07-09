import type { NoteFilterMetadata } from "@/lib/notes/noteDerivedData";
import { TimelineManager } from "@/lib/virtualization/TimelineManager";
import { Note, SortBy } from "@/types";
import { throttle } from "lodash-es";
import { useEffect, useMemo } from "react";

const MIN_RESIZE_DELTA = 1;

function normalizeViewportDimension(value: number) {
  return Math.round(value);
}

interface UseTimelineManagerProps {
  notes: Note[];
  noteFilterMetadata: NoteFilterMetadata[];
  expandedNoteIds: Set<string>;
  sortBy: SortBy;
  searchQuery: string;
  selectedDate: Date | null;
  selectedTagIds: Set<string>;
  tagFilterMode: "and" | "or";
  isLargeScreen: boolean;
  interfaceScale: number;
  isLoading: boolean;
  notesContainerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook to manage the TimelineManager instance, its properties, and internal re-renders.
 */
export function useTimelineManager({
  notes,
  noteFilterMetadata,
  expandedNoteIds,
  sortBy,
  searchQuery,
  selectedDate,
  selectedTagIds,
  tagFilterMode,
  isLargeScreen,
  interfaceScale,
  notesContainerRef,
}: UseTimelineManagerProps) {
  // 1. Instance (useMemo ensures it's stable)
  const timelineManager = useMemo(() => new TimelineManager(), []);

  // 2. Cleanup on unmount
  useEffect(() => {
    return () => {
      timelineManager.destroy();
    };
  }, [timelineManager]);

  // 3. Sync data properties from React state/props to the Manager
  useEffect(() => {
    timelineManager.batchUpdate(() => {
      timelineManager.setTimelineData(notes, noteFilterMetadata, sortBy);
      timelineManager.expandedNoteIds = expandedNoteIds;
      timelineManager.searchQuery = searchQuery;
      timelineManager.selectedDate = selectedDate;
      timelineManager.selectedTagIds = selectedTagIds;
      timelineManager.tagFilterMode = tagFilterMode;
    });
  }, [
    notes,
    noteFilterMetadata,
    expandedNoteIds,
    sortBy,
    searchQuery,
    selectedDate,
    selectedTagIds,
    tagFilterMode,
    timelineManager,
  ]);

  // 3b. Sync layout properties (columns, scale)
  useEffect(() => {
    timelineManager.columns = isLargeScreen ? 3 : 1;

    // Recalculate layout dimensions based on scale
    const scale = interfaceScale / 100;
    timelineManager.setLayoutOptions({
      headerHeight: 60 * scale,
      rowHeight: 150 * scale,
      gap: 16 * scale,
    });
  }, [isLargeScreen, interfaceScale, timelineManager]);

  // 3c. Sync top section height (header + AI generation previews)
  useEffect(() => {
    timelineManager.topSectionHeight = 0;
  }, [timelineManager]);

  // 4. Resize Observer for viewport dimensions
  useEffect(() => {
    const el = notesContainerRef.current;
    if (!el) return;

    let frameId: number | null = null;
    let lastQueuedWidth = 0;
    let lastQueuedHeight = 0;
    let lastEmittedWidth = 0;
    let lastEmittedHeight = 0;

    const throttledResize = throttle((width: number, height: number) => {
      if (
        Math.abs(width - lastEmittedWidth) < MIN_RESIZE_DELTA &&
        Math.abs(height - lastEmittedHeight) < MIN_RESIZE_DELTA
      ) {
        return;
      }

      lastEmittedWidth = width;
      lastEmittedHeight = height;
      timelineManager.setViewport(width, height);
    }, 80);

    const queueResize = (width: number, height: number) => {
      const nextWidth = normalizeViewportDimension(width);
      const nextHeight = normalizeViewportDimension(height);
      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }

      if (
        Math.abs(nextWidth - lastQueuedWidth) < MIN_RESIZE_DELTA &&
        Math.abs(nextHeight - lastQueuedHeight) < MIN_RESIZE_DELTA
      ) {
        return;
      }

      lastQueuedWidth = nextWidth;
      lastQueuedHeight = nextHeight;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;
        throttledResize(nextWidth, nextHeight);
      });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      queueResize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(el);

    // Initial measure
    const rect = el.getBoundingClientRect();
    queueResize(rect.width, rect.height);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      throttledResize.cancel();
    };
  }, [isLargeScreen, notesContainerRef, timelineManager]);

  return timelineManager;
}
