import { FolderNode, ZeroSortState } from "@/types";
import {
  getDirPath,
  getExpandedPathsForCatalog,
  persistExpandedPaths,
  persistTabs,
} from "../helpers";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

function omitNoteKey<T>(
  record: Record<string, T>,
  id: string,
): Record<string, T> {
  if (!(id in record)) {
    return record;
  }

  const { [id]: _removed, ...rest } = record;
  return rest;
}

/**
 * Creates the UI slice of the store.
 * Manages selection, sidebar, tabs, expansion states, and transient UI flags.
 */
export const createUiSlice = (set: SetState, get: GetState) => ({
  // --- Initial State ---
  selectedNoteId: null as string | null,
  lastSelectedNoteId: null as string | null,
  isMultiSelectMode: false,
  selectedNoteIds: new Set<string>(),
  isSidebarOpen: true,
  expandedPaths: new Set<string>(["root"]),
  expandedNoteIds: new Set<string>(),
  isInitialized: false,
  isRegeneratingTitle: false,
  isRegeneratingSummary: false,
  isRegeneratingDirectory: false,
  isRegeneratingTags: false,
  selectedTagIds: new Set<string>(),
  tagFilterMode: "or" as const,
  homeScrollPosition: 0,
  searchQuery: "",
  selectedDate: null as Date | null,
  openNoteIds: [] as string[],
  loadedNoteRecency: [] as string[],
  noteScrollPositions: {} as Record<string, number>,
  hasUnsavedChanges: false,
  saveCurrentNote: null as (() => Promise<boolean>) | null,
  pendingNoteId: undefined as string | null | undefined,
  pendingCloseNoteId: undefined as string | undefined,

  /**
   * Sets the initialization status of the application.
   */
  setInitialized: (initialized: boolean) => set({ isInitialized: initialized }),

  /**
   * Sets the currently selected note and ensures its path is expanded in the sidebar.
   */
  setSelectedNoteId: (id: string | null) => {
    const currentSelectedId = get().selectedNoteId;
    if (currentSelectedId === id) return;

    if (id === null && currentSelectedId !== null) {
      set({ lastSelectedNoteId: currentSelectedId });
    } else if (id !== null) {
      set({ lastSelectedNoteId: null });
    }

    set({
      selectedNoteId: id,
      hasUnsavedChanges: false,
      pendingNoteId: undefined,
    });

    if (id) {
      if (!get().openNoteIds.includes(id)) {
        set({ openNoteIds: [...get().openNoteIds, id] });
      }
    }

    if (id && get().notesById.get(id)?.isContentLoaded) {
      get().markNoteContentAccessed(id);
    }

    get().pruneLoadedNoteContent();

    if (id) {
      const note = get().notesById.get(id);
      if (note && note.directoryId) {
        const folders = getDirPath(note.directoryId, get().directories);
        const catalogPaths = getExpandedPathsForCatalog(folders);
        const currentPaths = get().expandedPaths;

        const hasNewPaths = catalogPaths.some((p) => !currentPaths.has(p));
        if (hasNewPaths) {
          const newExpandedPaths = new Set(currentPaths);
          catalogPaths.forEach((path) => {
            newExpandedPaths.add(path);
          });
          set({ expandedPaths: newExpandedPaths });
          persistExpandedPaths(get);
        }
      }
    }

    persistTabs(get);
  },

  /**
   * Updates the flag indicating if the current note has unsaved changes.
   */
  setHasUnsavedChanges: (hasChanges: boolean) =>
    set({ hasUnsavedChanges: hasChanges }),

  /**
   * Registers or clears the save callback for the currently open note.
   */
  setSaveCurrentNote: (fn: (() => Promise<boolean>) | null) =>
    set({ saveCurrentNote: fn }),

  /**
   * Attempts to select a new note, checking for unsaved changes first.
   */
  confirmNoteSelection: (id: string | null) => {
    if (get().hasUnsavedChanges) {
      set({ pendingNoteId: id });
    } else {
      get().setSelectedNoteId(id);
    }
  },

  /**
   * Cancels a pending note selection.
   */
  cancelNoteSelection: () => set({ pendingNoteId: undefined }),

  /**
   * Enters or exits multi-select mode. Clears selection on exit.
   */
  toggleMultiSelectMode: () => {
    const isMultiSelectMode = !get().isMultiSelectMode;
    set({
      isMultiSelectMode,
      selectedNoteIds: isMultiSelectMode ? get().selectedNoteIds : new Set(),
    });
  },

  /**
   * Toggles a note's selection state in multi-select mode.
   */
  toggleNoteSelection: (id: string) => {
    const newSet = new Set(get().selectedNoteIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    set({ selectedNoteIds: newSet });
  },

  /**
   * Selects all provided note IDs.
   */
  selectAllNotes: (noteIds: string[]) => {
    set({ selectedNoteIds: new Set(noteIds) });
  },

  /**
   * Adds the provided note IDs to the current selection.
   */
  addToNoteSelection: (noteIds: string[]) => {
    const newSet = new Set(get().selectedNoteIds);
    for (const id of noteIds) newSet.add(id);
    set({ selectedNoteIds: newSet });
  },

  /**
   * Removes the provided note IDs from the current selection.
   */
  removeFromNoteSelection: (noteIds: string[]) => {
    const newSet = new Set(get().selectedNoteIds);
    for (const id of noteIds) newSet.delete(id);
    set({ selectedNoteIds: newSet });
  },

  /**
   * Clears all selected notes.
   */
  clearNoteSelection: () => {
    set({ selectedNoteIds: new Set() });
  },

  /**
   * Attempts to close a note tab, checking for unsaved changes first.
   * Only prompts when closing the currently selected (active) note with unsaved changes.
   */
  confirmCloseNote: (id: string) => {
    const { hasUnsavedChanges, selectedNoteId, closeNote } = get();
    if (id === selectedNoteId && hasUnsavedChanges) {
      set({ pendingCloseNoteId: id });
    } else {
      closeNote(id);
    }
  },

  /**
   * Cancels a pending note tab close.
   */
  cancelCloseNote: () => set({ pendingCloseNoteId: undefined }),

  /**
   * Reorders open note tabs and persists the new order.
   */
  reorderOpenNotes: (fromIndex: number, toIndex: number) => {
    const { openNoteIds } = get();

    if (
      fromIndex < 0 ||
      fromIndex >= openNoteIds.length ||
      toIndex < 0 ||
      toIndex > openNoteIds.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const nextOpenNoteIds = [...openNoteIds];
    const [movedNoteId] = nextOpenNoteIds.splice(fromIndex, 1);

    if (!movedNoteId) {
      return;
    }

    nextOpenNoteIds.splice(
      Math.min(toIndex, nextOpenNoteIds.length),
      0,
      movedNoteId,
    );
    set({ openNoteIds: nextOpenNoteIds });
    persistTabs(get);
  },

  /**
   * Closes a note tab.
   */
  closeNote: (id: string) => {
    const { openNoteIds, selectedNoteId, selectedNoteIds } = get();
    const newOpenNoteIds = openNoteIds.filter((noteId) => noteId !== id);
    const nextSelectedNoteIds = new Set(selectedNoteIds);
    nextSelectedNoteIds.delete(id);
    const nextNoteScrollPositions = omitNoteKey(get().noteScrollPositions, id);

    if (selectedNoteId === id) {
      const remainingIds = newOpenNoteIds;
      const nextId = remainingIds.length > 0 ? remainingIds[0] : null;
      set({
        openNoteIds: newOpenNoteIds,
        selectedNoteIds: nextSelectedNoteIds,
        selectedNoteId: nextId,
        lastSelectedNoteId: nextId === null ? id : null,
        hasUnsavedChanges: false,
        pendingNoteId: undefined,
        pendingCloseNoteId: undefined,
        noteScrollPositions: nextNoteScrollPositions,
      });
    } else {
      set({
        openNoteIds: newOpenNoteIds,
        selectedNoteIds: nextSelectedNoteIds,
        pendingCloseNoteId: undefined,
        noteScrollPositions: nextNoteScrollPositions,
      });
    }

    get().unloadNoteContent(id);
    if (get().openNoteIds.length === 0) {
      get().releaseAllNoteContent?.();
    } else if (
      get().selectedNoteId &&
      get().notesById.get(get().selectedNoteId!)?.isContentLoaded
    ) {
      get().markNoteContentAccessed(get().selectedNoteId!);
    }
    persistTabs(get);
  },

  /**
   * Toggles the visibility of the sidebar.
   */
  toggleSidebar: () => {
    set({ isSidebarOpen: !get().isSidebarOpen });
  },

  /**
   * Toggles the expansion state of a specific folder path in the sidebar.
   */
  togglePath: (path: string) => {
    const newExpandedPaths = new Set(get().expandedPaths);
    if (newExpandedPaths.has(path)) {
      newExpandedPaths.delete(path);
    } else {
      newExpandedPaths.add(path);
    }
    set({ expandedPaths: newExpandedPaths });
    persistExpandedPaths(get);
  },

  /**
   * Toggles the expansion state of a specific note card.
   */
  toggleNoteExpansion: (id: string) => {
    const newExpandedNoteIds = new Set(get().expandedNoteIds);
    if (newExpandedNoteIds.has(id)) {
      newExpandedNoteIds.delete(id);
    } else {
      newExpandedNoteIds.add(id);
    }
    set({ expandedNoteIds: newExpandedNoteIds });
  },

  /**
   * Expands all folders in the sidebar.
   */
  expandAll: () => {
    const getAllPaths = (
      node: FolderNode,
      currentPath: string[] = [],
    ): string[] => {
      const paths: string[] = [];
      const pathStr = currentPath.length === 0 ? "root" : currentPath.join("/");
      paths.push(pathStr);

      Object.keys(node.children).forEach((childName) => {
        paths.push(
          ...getAllPaths(node.children[childName], [...currentPath, childName]),
        );
      });

      return paths;
    };

    const allPaths = getAllPaths(get().folderTree);
    set({ expandedPaths: new Set(allPaths) });
    persistExpandedPaths(get);
  },

  /**
   * Collapses all folders in the sidebar, keeping only the root expanded.
   */
  collapseAll: () => {
    set({ expandedPaths: new Set(["root"]) });
    persistExpandedPaths(get);
  },

  /**
   * Updates the flag indicating if the title is being regenerated by AI.
   */
  setIsRegeneratingTitle: (isRegenerating: boolean) =>
    set({ isRegeneratingTitle: isRegenerating }),

  /**
   * Updates the flag indicating if the summary is being regenerated by AI.
   */
  setIsRegeneratingSummary: (isRegenerating: boolean) =>
    set({ isRegeneratingSummary: isRegenerating }),

  /**
   * Updates the flag indicating if the catalog/folder is being regenerated by AI.
   */
  setIsRegeneratingDirectory: (isRegenerating: boolean) =>
    set({ isRegeneratingDirectory: isRegenerating }),

  /**
   * Updates the flag indicating if tags are being regenerated by AI.
   */
  setIsRegeneratingTags: (isRegenerating: boolean) =>
    set({ isRegeneratingTags: isRegenerating }),

  /**
   * Toggles a tag's selection state for filtering.
   */
  toggleTagFilter: (tagId: string) => {
    const newSelectedTagIds = new Set(get().selectedTagIds);
    if (newSelectedTagIds.has(tagId)) {
      newSelectedTagIds.delete(tagId);
    } else {
      newSelectedTagIds.add(tagId);
    }
    set({ selectedTagIds: newSelectedTagIds });
  },

  /**
   * Clears all tag filter selections.
   */
  clearTagFilters: () => set({ selectedTagIds: new Set<string>() }),

  /**
   * Sets the tag filter mode.
   */
  setTagFilterMode: (mode: "and" | "or") => set({ tagFilterMode: mode }),

  /**
   * Sets the scroll position for the home page.
   */
  setHomeScrollPosition: (pos: number) => set({ homeScrollPosition: pos }),

  /**
   * Sets the scroll position for a specific note.
   */
  setNoteScrollPosition: (id: string, pos: number) =>
    set((state) => ({
      noteScrollPositions: { ...state.noteScrollPositions, [id]: pos },
    })),

  /**
   * Sets the search query for notes and directories.
   */
  setSearchQuery: (query: string) => set({ searchQuery: query }),

  /**
   * Sets the selected date for filtering notes.
   */
  setSelectedDate: (date: Date | null) => set({ selectedDate: date }),
});
