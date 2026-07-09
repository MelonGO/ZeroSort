import { FloatingActionButton } from "@/components/home/FloatingActionButton";
import { HomeHeader } from "@/components/home/HomeHeader";
import { NotesEmptyState } from "@/components/home/NotesEmptyState";
import { SidebarToggle } from "@/components/home/SidebarToggle";
import { VirtualizedNoteList } from "@/components/home/VirtualizedNoteList";
import { Sidebar } from "@/components/layout/Sidebar";
import { TimelineScrubber } from "@/components/layout/TimelineScrubber";
import { BatchProgressPanel } from "@/components/notes/BatchProgressPanel";
import { BatchRegenerateDialog } from "@/components/notes/BatchRegenerateDialog";
import { TagManager } from "@/components/tags/TagManager";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { deleteFakeNotes, seedFakeNotes } from "@/dev/seed";
import { useBatchRegenerate } from "@/hooks/useBatchRegenerate";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { useNoteActions } from "@/hooks/useNoteActions";
import { useTimelineManager } from "@/hooks/useTimelineManager";
import { useTimelineScroll } from "@/hooks/useTimelineScroll";
import { buildSortedNoteFilterMetadata } from "@/lib/notes/noteDerivedData";
import { cn } from "@/lib/utils";
import { TimelineManager } from "@/lib/virtualization/TimelineManager";
import { useStore } from "@/store/useStore";
import { RegenerateField, SortBy } from "@/types";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { type ImperativePanelHandle } from "react-resizable-panels";
import { useShallow } from "zustand/react/shallow";

export const Route = createFileRoute("/")({
  component: Home,
});

const MIN_TOP_CONTENT_DELTA = 1;
const LazyNoteTabs = lazy(() =>
  import("@/components/editor/NoteTabs").then((module) => ({
    default: module.NoteTabs,
  })),
);
const LazyNoteViewer = lazy(() =>
  import("@/components/editor/NoteViewer").then((module) => ({
    default: module.NoteViewer,
  })),
);

function normalizeTopContentHeight(value: number) {
  return Math.round(value);
}

/**
 * Renders a lightweight placeholder while the lazily loaded note editor stack loads.
 */
function NoteEditorFallback() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="h-10 border-b border-border bg-muted/20" />
      <div className="flex-1 bg-muted/10" />
    </div>
  );
}

interface TimelineBodyProps {
  timelineManager: TimelineManager;
  selectedNoteId: string | null;
  lastSelectedNoteId: string | null;
  expandedNoteIds: Set<string>;
  sortBy: SortBy;
  onToggleExpand: (id: string) => void;
  isMultiSelectMode: boolean;
  selectedNoteIds: Set<string>;
  onToggleMultiSelect: (id: string) => void;
  onSelectMonthNotes: (noteIds: string[]) => void;
  isMobile: boolean;
}

interface TimelineScrubberPanelProps {
  timelineManager: TimelineManager;
  onMonthClick: (year: number, month: number) => void;
  className?: string;
}

function subscribeToTimelineManager(
  timelineManager: TimelineManager,
  listener: () => void,
) {
  timelineManager.addListener(listener);

  return () => {
    timelineManager.removeListener(listener);
  };
}

const TimelineBody = memo(function TimelineBody({
  timelineManager,
  selectedNoteId,
  lastSelectedNoteId,
  expandedNoteIds,
  sortBy,
  onToggleExpand,
  isMultiSelectMode,
  selectedNoteIds,
  onToggleMultiSelect,
  onSelectMonthNotes,
  isMobile,
}: TimelineBodyProps) {
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeToTimelineManager(timelineManager, listener),
    [timelineManager],
  );
  const getSnapshot = useCallback(
    () => `${timelineManager.version}:${timelineManager.layoutVersion}`,
    [timelineManager],
  );
  const timelineVersion = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  return (
    <div
      className="relative mx-auto"
      style={{ height: timelineManager.bodySectionHeight }}
    >
      <VirtualizedNoteList
        visibleItems={timelineManager.visibleItems}
        timelineVersion={timelineVersion}
        selectedNoteId={selectedNoteId}
        lastSelectedNoteId={lastSelectedNoteId}
        expandedNoteIds={expandedNoteIds}
        sortBy={sortBy}
        onToggleExpand={onToggleExpand}
        isMultiSelectMode={isMultiSelectMode}
        selectedNoteIds={selectedNoteIds}
        onToggleMultiSelect={onToggleMultiSelect}
        onSelectMonthNotes={onSelectMonthNotes}
        isMobile={isMobile}
      />
    </div>
  );
});

const TimelineScrubberPanel = memo(function TimelineScrubberPanel({
  timelineManager,
  onMonthClick,
  className,
}: TimelineScrubberPanelProps) {
  const { t } = useTranslation();
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeToTimelineManager(timelineManager, listener),
    [timelineManager],
  );
  const getSnapshot = useCallback(
    () =>
      `${timelineManager.layoutVersion}:${
        timelineManager.getActiveMonthId(timelineManager.scrollTop) ?? ""
      }`,
    [timelineManager],
  );
  const timelineSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );

  const months = useMemo(
    () =>
      timelineManager.monthGroups.map((group) => ({
        year: group.year,
        month: group.month,
        title: t(`common.months.${group.month}`),
        count: group.notesCount,
        height: group.height,
      })),
    [t, timelineManager, timelineSnapshot],
  );
  const activeMonthId = timelineManager.getActiveMonthId(
    timelineManager.scrollTop,
  );

  return (
    <TimelineScrubber
      months={months}
      onMonthClick={onMonthClick}
      activeMonthId={activeMonthId}
      className={className}
    />
  );
});

/**
 * The primary workspace component.
 * Orchestrates the application's main layout, including:
 * - A resizable navigation sidebar.
 * - A virtualized, timeline-organized grid of notes.
 * - A quick-create action for new notes.
 * - A detailed note viewer for selected content.
 */
function Home() {
  const { t } = useTranslation();

  // --- Debugging & Development ---
  useEffect(() => {
    (window as any).seedFakeNotes = seedFakeNotes;
    (window as any).deleteFakeNotes = deleteFakeNotes;
  }, []);

  // --- Store & State Management ---
  const {
    notes,
    isSidebarOpen,
    selectedNoteId,
    lastSelectedNoteId,
    expandedNoteIds,
    interfaceScale,
    sortBy,
    searchQuery,
    selectedDate,
    selectedTagIds,
    tagFilterMode,
    hasUnsavedChanges,
    isMultiSelectMode,
    selectedNoteIds,
    batchJob,
  } = useStore(
    useShallow((state) => ({
      notes: state.notes,
      isSidebarOpen: state.isSidebarOpen,
      selectedNoteId: state.selectedNoteId,
      lastSelectedNoteId: state.lastSelectedNoteId,
      expandedNoteIds: state.expandedNoteIds,
      interfaceScale: state.interfaceScale,
      sortBy: state.sortBy,
      searchQuery: state.searchQuery,
      selectedDate: state.selectedDate,
      selectedTagIds: state.selectedTagIds,
      tagFilterMode: state.tagFilterMode,
      hasUnsavedChanges: state.hasUnsavedChanges,
      isMultiSelectMode: state.isMultiSelectMode,
      selectedNoteIds: state.selectedNoteIds,
      batchJob: state.batchJob,
    })),
  );

  // Actions are referentially stable in Zustand — no shallow comparison needed
  const toggleSidebar = useStore((state) => state.toggleSidebar);
  const toggleNoteExpansion = useStore((state) => state.toggleNoteExpansion);
  const setHomeScrollPosition = useStore(
    (state) => state.setHomeScrollPosition,
  );
  const setSortBy = useStore((state) => state.setSortBy);
  const setSelectedDate = useStore((state) => state.setSelectedDate);
  const toggleMultiSelectMode = useStore(
    (state) => state.toggleMultiSelectMode,
  );
  const toggleNoteSelection = useStore((state) => state.toggleNoteSelection);
  const addToNoteSelection = useStore((state) => state.addToNoteSelection);
  const removeFromNoteSelection = useStore(
    (state) => state.removeFromNoteSelection,
  );
  const saveCurrentNote = useStore((state) => state.saveCurrentNote);

  const { isLoading, createEmptyNote } = useNoteActions();
  const { startBatch, cancelBatch } = useBatchRegenerate();
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

  const handleCreateNote = useCallback(async () => {
    await createEmptyNote();
  }, [createEmptyNote]);

  const handleSelectMonthNotes = useCallback(
    (noteIds: string[]) => {
      const allSelected =
        noteIds.length > 0 && noteIds.every((id) => selectedNoteIds.has(id));
      if (!isMultiSelectMode) {
        toggleMultiSelectMode();
      }
      if (allSelected) {
        removeFromNoteSelection(noteIds);
      } else {
        addToNoteSelection(noteIds);
      }
    },
    [
      selectedNoteIds,
      isMultiSelectMode,
      toggleMultiSelectMode,
      addToNoteSelection,
      removeFromNoteSelection,
    ],
  );

  // --- Navigation Blocking for Unsaved Changes ---
  const [isSavingBeforeNav, setIsSavingBeforeNav] = useState(false);

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    withResolver: true,
    enableBeforeUnload: false,
  });

  const handleSaveAndProceed = async () => {
    if (saveCurrentNote) {
      setIsSavingBeforeNav(true);
      try {
        const didSave = await saveCurrentNote();
        if (!didSave) {
          return;
        }
      } catch (error) {
        console.error("Failed to save note before navigation:", error);
        return;
      } finally {
        setIsSavingBeforeNav(false);
      }
    }
    proceed?.();
  };

  // --- Layout & Responsiveness ---
  const isLargeScreen = useIsLargeScreen();

  // --- Resizable Panel Refs ---
  const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

  // Sync the sidebar panel state with the store's isSidebarOpen state
  useEffect(() => {
    if (isLargeScreen) {
      if (isSidebarOpen) {
        sidebarPanelRef.current?.expand();
      } else {
        sidebarPanelRef.current?.collapse();
      }
    }
  }, [isSidebarOpen, isLargeScreen]);

  // --- Virtualization & Scrolling ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topContentRef = useRef<HTMLDivElement>(null);
  const [topContentHeight, setTopContentHeight] = useState(0);

  const timelineData = useMemo(
    () => buildSortedNoteFilterMetadata(notes, sortBy),
    [notes, sortBy],
  );

  const timelineManager = useTimelineManager({
    notes: timelineData.notes,
    noteFilterMetadata: timelineData.metadata,
    expandedNoteIds,
    sortBy,
    searchQuery,
    selectedDate,
    selectedTagIds,
    tagFilterMode,
    isLargeScreen,
    interfaceScale,
    isLoading,
    notesContainerRef: scrollContainerRef,
  });
  const subscribeToFilterCounts = useCallback(
    (listener: () => void) =>
      subscribeToTimelineManager(timelineManager, listener),
    [timelineManager],
  );
  const getFilterCountsSnapshot = useCallback(
    () => timelineManager.version,
    [timelineManager],
  );
  useSyncExternalStore(
    subscribeToFilterCounts,
    getFilterCountsSnapshot,
    getFilterCountsSnapshot,
  );

  useLayoutEffect(() => {
    const updateTopContentHeight = (nextHeight: number) => {
      const normalizedHeight = normalizeTopContentHeight(nextHeight);
      setTopContentHeight((currentHeight) =>
        Math.abs(currentHeight - normalizedHeight) < MIN_TOP_CONTENT_DELTA
          ? currentHeight
          : normalizedHeight,
      );
    };

    if (selectedNoteId) {
      updateTopContentHeight(timelineManager.bodySectionHeight);
      return;
    }

    const element = topContentRef.current;
    if (!element) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      updateTopContentHeight(element.getBoundingClientRect().height);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    isLargeScreen,
    isMultiSelectMode,
    isSidebarOpen,
    notes.length,
    selectedDate?.getTime(),
    selectedNoteId,
    selectedNoteIds.size,
    selectedTagIds.size,
    sortBy,
    timelineManager.bodySectionHeight,
  ]);
  const initialHomeScrollPosition = useRef(
    useStore.getState().homeScrollPosition,
  ).current;

  const { handleScroll } = useTimelineScroll({
    scrollContainerRef,
    timelineManager,
    initialHomeScrollPosition,
    setHomeScrollPosition,
    selectedNoteId,
    lastSelectedNoteId,
    isLoading,
    topContentHeight,
  });
  const noteCountsByDate = timelineManager.noteCountsByDate;
  const tagNoteCounts = timelineManager.tagNoteCounts;

  const scrollToMonth = useCallback(
    (year: number, month: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const y = timelineManager.getScrollPositionForMonth(year, month);
      el.scrollTo({ top: topContentHeight + y, behavior: "instant" });
    },
    [timelineManager, topContentHeight],
  );

  // --- Shared Content Components ---
  const renderScrollContent = (isMobile: boolean) => (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={cn(
        "flex-1 overflow-y-auto scroll-smooth pb-8",
        isMobile ? "pl-4 pr-16 pt-14" : "p-8",
      )}
    >
      {selectedNoteId ? (
        // Spacer preserves scrollTop while the NoteViewer overlay is active
        <div
          ref={topContentRef}
          style={{ height: timelineManager.bodySectionHeight }}
        />
      ) : (
        <>
          <div ref={topContentRef}>
            <HomeHeader
              sortBy={sortBy}
              onSortChange={setSortBy}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              noteCountsByDate={noteCountsByDate}
              isMultiSelectMode={isMultiSelectMode}
              selectedCount={selectedNoteIds.size}
              totalCount={notes.length}
              onToggleMultiSelect={toggleMultiSelectMode}
              onBatchRegenerate={() => setIsBatchDialogOpen(true)}
              onOpenTagManager={() => setIsTagManagerOpen(true)}
            />
          </div>

          {notes.length === 0 && !isLoading ? (
            <NotesEmptyState />
          ) : (
            <TimelineBody
              timelineManager={timelineManager}
              selectedNoteId={selectedNoteId}
              lastSelectedNoteId={lastSelectedNoteId}
              expandedNoteIds={expandedNoteIds}
              sortBy={sortBy}
              onToggleExpand={toggleNoteExpansion}
              isMultiSelectMode={isMultiSelectMode}
              selectedNoteIds={selectedNoteIds}
              onToggleMultiSelect={toggleNoteSelection}
              onSelectMonthNotes={handleSelectMonthNotes}
              isMobile={isMobile}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Sidebar Overlay (Backdrop) */}
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={toggleSidebar}
          aria-label="Close sidebar"
        />
      )}

      {/* Mobile Sidebar Navigation Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 overflow-hidden bg-background transition-all duration-300 ease-in-out md:hidden",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ width: "17.5rem" }}
      >
        <Sidebar />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {isLargeScreen ? (
          /* Desktop Layout */
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="main-layout"
            className="flex-1"
          >
            <ResizablePanel
              ref={sidebarPanelRef}
              id="sidebar"
              defaultSize={20}
              minSize={15}
              maxSize={40}
              collapsible
              collapsedSize={0}
              onCollapse={() => {
                if (isSidebarOpen) toggleSidebar();
              }}
              onExpand={() => {
                if (!isSidebarOpen) toggleSidebar();
              }}
              className="h-full border-r"
            >
              <Sidebar />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel id="main" minSize={30}>
              <div className="relative flex h-full flex-1 flex-col overflow-hidden">
                <SidebarToggle
                  isOpen={isSidebarOpen}
                  panelRef={sidebarPanelRef}
                />

                <div className="relative flex flex-1 overflow-hidden">
                  {renderScrollContent(false)}

                  {notes.length > 0 && isLargeScreen && !selectedNoteId && (
                    <TimelineScrubberPanel
                      timelineManager={timelineManager}
                      onMonthClick={scrollToMonth}
                      className="border-l border-border"
                    />
                  )}
                </div>

                {!selectedNoteId && (
                  <FloatingActionButton
                    onClick={handleCreateNote}
                    variant="desktop"
                  />
                )}

                {selectedNoteId && (
                  <div className="absolute inset-0 z-20 flex h-full flex-col overflow-hidden bg-background">
                    <div className="relative flex items-center">
                      <SidebarToggle
                        isOpen={isSidebarOpen}
                        panelRef={sidebarPanelRef}
                      />
                      <Suspense fallback={<div className="h-10 flex-1" />}>
                        <LazyNoteTabs />
                      </Suspense>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <Suspense fallback={<NoteEditorFallback />}>
                        <LazyNoteViewer />
                      </Suspense>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          /* Mobile Layout */
          <div className="relative flex h-full flex-1 flex-col overflow-hidden">
            <SidebarToggle isOpen={isSidebarOpen} onToggle={toggleSidebar} />

            <div className="relative flex h-full flex-1 overflow-hidden">
              {notes.length > 0 && !selectedNoteId && (
                <div className="pointer-events-none absolute top-16 right-0 bottom-16 z-30 w-10">
                  <TimelineScrubberPanel
                    timelineManager={timelineManager}
                    onMonthClick={scrollToMonth}
                    className="pointer-events-auto"
                  />
                </div>
              )}

              {renderScrollContent(true)}
            </div>

            {!selectedNoteId && (
              <FloatingActionButton
                onClick={handleCreateNote}
                variant="mobile"
              />
            )}

            {selectedNoteId && (
              <div className="absolute inset-0 z-20 flex h-full flex-col overflow-hidden bg-background">
                <div className="relative flex items-center">
                  <SidebarToggle
                    isOpen={isSidebarOpen}
                    onToggle={toggleSidebar}
                  />
                  <Suspense fallback={<div className="h-10 flex-1" />}>
                    <LazyNoteTabs />
                  </Suspense>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Suspense fallback={<NoteEditorFallback />}>
                    <LazyNoteViewer />
                  </Suspense>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Route Navigation Blocker — Unsaved Changes Dialog */}
      {status === "blocked" && (
        <div className="fixed inset-0 z-100 flex animate-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200 fade-in">
          <div className="w-full max-w-100 animate-in rounded-2xl bg-background p-6 shadow-2xl duration-200 zoom-in-95">
            <h3 className="mb-2 text-xl font-bold">
              {t("note.unsavedChanges")}
            </h3>
            <p className="mb-6 text-muted-foreground">
              {t("note.unsavedChangesDescription")}
            </p>
            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onClick={handleSaveAndProceed}
                disabled={isSavingBeforeNav}
                className="flex w-full items-center justify-center rounded-xl bg-accent px-4 py-3 font-semibold"
              >
                {isSavingBeforeNav
                  ? t("common.saving")
                  : t("note.saveAndContinue")}
              </button>
              <button
                type="button"
                onClick={() => proceed?.()}
                className="w-full rounded-xl bg-muted px-4 py-3 font-semibold"
              >
                {t("note.discardChanges")}
              </button>
              <button
                type="button"
                onClick={() => reset?.()}
                className="w-full px-4 py-3"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <BatchRegenerateDialog
        isOpen={isBatchDialogOpen}
        onClose={() => setIsBatchDialogOpen(false)}
        selectedCount={selectedNoteIds.size}
        onConfirm={(fields: RegenerateField[]) =>
          startBatch(Array.from(selectedNoteIds), fields)
        }
      />

      <TagManager
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
        tagNoteCounts={tagNoteCounts}
      />

      {batchJob && <BatchProgressPanel onCancel={cancelBatch} />}
    </div>
  );
}
