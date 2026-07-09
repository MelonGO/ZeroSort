import i18n from "@/i18n";
import {
  cleanupEmptyDirectoriesAction,
  deleteDirectoryAction,
  getDirectoriesAction,
  getNoteContentAction,
  moveDirectoryAction,
  saveDirectoryAction,
  saveNoteAction,
  setNoteTagIdsAction,
  updateDirectoryAction,
  updateNoteDirectoryAction,
} from "@/lib/actions";
import { updateLinksForRenamedNote } from "@/lib/db/noteLinks";
import {
  clearParsedEditorContent,
  pruneParsedEditorContent,
} from "@/lib/tiptap/editorContentCache";
import { Directory, FolderNode, Note, Tag, ZeroSortState } from "@/types";
import { toast } from "sonner";
import {
  buildTree,
  getDirPath,
  getExpandedPathsForCatalog,
  persistTabs,
} from "../helpers";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

const inFlightNoteContentLoads = new Map<string, Promise<void>>();
const noteContentLoadVersions = new Map<string, number>();
const LOADED_NOTE_CACHE_LIMIT = 10;

/** Module-level store for note content strings, kept outside Zustand to avoid copying multi-MB strings on every state update. */
const noteContentStore = new Map<string, string>();

/** Returns the content string for a note from the module-level cache. */
export function getNoteContentFromStore(id: string): string {
  return noteContentStore.get(id) ?? "";
}

/** Stores the content string for a note in the module-level cache. */
export function setNoteContentInStore(id: string, content: string): void {
  noteContentStore.set(id, content);
}

function pruneNoteContentStore(validNoteIds: Set<string>) {
  for (const noteId of noteContentStore.keys()) {
    if (!validNoteIds.has(noteId)) {
      noteContentStore.delete(noteId);
    }
  }
}

const buildNotesById = (notes: Note[]) =>
  new Map(notes.map((note) => [note.id, note]));

function getNoteIdSet(notes: Note[]): Set<string> {
  const noteIds = new Set<string>();
  for (const note of notes) {
    noteIds.add(note.id);
  }
  return noteIds;
}

function getLoadedNoteIdSet(notes: Note[]): Set<string> {
  const noteIds = new Set<string>();
  for (const note of notes) {
    if (note.isContentLoaded) {
      noteIds.add(note.id);
    }
  }
  return noteIds;
}

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

function getLoadedNoteRecency(state: ZeroSortState) {
  return state.loadedNoteRecency.filter((noteId) => {
    return state.notesById.get(noteId)?.isContentLoaded;
  });
}

function updateSingleNoteInState(
  state: ZeroSortState,
  id: string,
  updates: Partial<Note>,
): Partial<ZeroSortState> {
  const note = state.notesById.get(id);
  if (!note) {
    return {};
  }

  const updatedNote = { ...note, ...updates };
  const nextNotes = state.notes.map((currentNote) =>
    currentNote.id === id ? updatedNote : currentNote,
  );
  const nextNotesById = new Map(state.notesById).set(id, updatedNote);

  return {
    notes: nextNotes,
    notesById: nextNotesById,
  };
}

function pruneNoteContentLoadVersions(validNoteIds: Iterable<string>) {
  const validIds = new Set(validNoteIds);

  for (const noteId of noteContentLoadVersions.keys()) {
    if (!validIds.has(noteId) && !inFlightNoteContentLoads.has(noteId)) {
      noteContentLoadVersions.delete(noteId);
    }
  }
}

function invalidateNoteContentLoad(noteId: string) {
  const nextVersion = (noteContentLoadVersions.get(noteId) ?? 0) + 1;

  if (inFlightNoteContentLoads.has(noteId)) {
    noteContentLoadVersions.set(noteId, nextVersion);
  } else {
    noteContentLoadVersions.delete(noteId);
  }
}

function invalidateAllInFlightNoteContentLoads() {
  for (const noteId of inFlightNoteContentLoads.keys()) {
    noteContentLoadVersions.set(
      noteId,
      (noteContentLoadVersions.get(noteId) ?? 0) + 1,
    );
  }
}

function deleteNoteContentTracking(noteId: string) {
  clearParsedEditorContent(noteId);
  noteContentStore.delete(noteId);
  inFlightNoteContentLoads.delete(noteId);
  noteContentLoadVersions.delete(noteId);
}

/**
 * Creates the notes & directories slice of the store.
 * Manages CRUD operations for notes and directories, folder tree construction.
 */
export const createNotesSlice = (set: SetState, get: GetState) => ({
  // --- Initial State ---
  notes: [] as Note[],
  notesById: new Map<string, Note>(),
  directories: [] as Directory[],
  folderTree: { name: "root", children: {}, noteIds: [] } as FolderNode,

  /**
   * Adds a new note to the store and updates the folder tree.
   */
  addNote: (note: Note) => {
    const newNotes = [{ ...note, tagIds: note.tagIds ?? [] }, ...get().notes];
    const newExpandedPaths = new Set(get().expandedPaths);

    if (note.directoryId) {
      const folders = getDirPath(note.directoryId, get().directories);
      getExpandedPathsForCatalog(folders).forEach((path) => {
        newExpandedPaths.add(path);
      });
    }

    set({
      notes: newNotes,
      notesById: buildNotesById(newNotes),
      folderTree: buildTree(newNotes, get().directories),
      expandedPaths: newExpandedPaths,
    });

    get().confirmNoteSelection(note.id);
  },

  /**
   * Updates an existing note in the store and refreshes the folder tree.
   */
  updateNote: (id: string, updates: Partial<Note>) => {
    let treeNeedsRebuild = false;
    let updatedNote: Note | undefined;
    const oldNote = get().notesById.get(id);

    const newNotes = get().notes.map((n) => {
      if (n.id === id) {
        if ("directoryId" in updates && updates.directoryId !== n.directoryId) {
          treeNeedsRebuild = true;
        }
        updatedNote = { ...n, ...updates };
        return updatedNote;
      }
      return n;
    });

    // Immutable Map update: copies entry references (O(n) pointer copies) but avoids
    // rebuilding from scratch via buildNotesById which creates a new tuple array.
    const newNotesById = new Map(get().notesById);
    if (updatedNote) {
      newNotesById.set(id, updatedNote);
    }

    if (treeNeedsRebuild) {
      set({
        notes: newNotes,
        notesById: newNotesById,
        folderTree: buildTree(newNotes, get().directories),
      });
    } else {
      set({
        notes: newNotes,
        notesById: newNotesById,
      });
    }

    // Update links if title changed
    if (oldNote && updates.title && oldNote.title !== updates.title) {
      updateLinksForRenamedNote(id, updates.title).catch((error) => {
        console.error("Failed to update links for renamed note:", error);
      });
    }
  },

  /**
   * Updates multiple notes in one store pass and refreshes the folder tree only when needed.
   */
  updateNotes: (updatesById: Map<string, Partial<Note>>) => {
    if (updatesById.size === 0) {
      return;
    }

    let treeNeedsRebuild = false;
    const renamedNotes: Array<{ id: string; title: string }> = [];
    const nextNotesById = new Map(get().notesById);
    let didUpdate = false;

    const newNotes = get().notes.map((note) => {
      const updates = updatesById.get(note.id);
      if (!updates) {
        return note;
      }

      if (
        "directoryId" in updates &&
        updates.directoryId !== note.directoryId
      ) {
        treeNeedsRebuild = true;
      }

      if (updates.title && updates.title !== note.title) {
        renamedNotes.push({ id: note.id, title: updates.title });
      }

      const updatedNote = { ...note, ...updates };
      nextNotesById.set(note.id, updatedNote);
      didUpdate = true;
      return updatedNote;
    });

    if (!didUpdate) {
      return;
    }

    if (treeNeedsRebuild) {
      set({
        notes: newNotes,
        notesById: nextNotesById,
        folderTree: buildTree(newNotes, get().directories),
      });
    } else {
      set({
        notes: newNotes,
        notesById: nextNotesById,
      });
    }

    for (const renamedNote of renamedNotes) {
      updateLinksForRenamedNote(renamedNote.id, renamedNote.title).catch(
        (error) => {
          console.error("Failed to update links for renamed note:", error);
        },
      );
    }
  },

  deleteNote: (id: string) => {
    const { selectedNoteId, openNoteIds, selectedNoteIds } = get();
    const newNotes = get().notes.filter((n) => n.id !== id);
    const newNoteIdSet = getNoteIdSet(newNotes);
    const nextSelectedNoteIds = new Set(selectedNoteIds);
    nextSelectedNoteIds.delete(id);

    deleteNoteContentTracking(id);
    pruneParsedEditorContent(getLoadedNoteIdSet(newNotes));
    pruneNoteContentLoadVersions(newNoteIdSet);

    set({
      notes: newNotes,
      notesById: buildNotesById(newNotes),
      folderTree: buildTree(newNotes, get().directories),
      selectedNoteId: selectedNoteId === id ? null : selectedNoteId,
      openNoteIds: openNoteIds.filter((noteId) => noteId !== id),
      selectedNoteIds: nextSelectedNoteIds,
      loadedNoteRecency: get().loadedNoteRecency.filter(
        (noteId) => noteId !== id,
      ),
      noteScrollPositions: omitNoteKey(get().noteScrollPositions, id),
    });

    persistTabs(get);
  },

  /**
   * Overwrites the current notes list and rebuilds the folder tree.
   */
  setNotes: (notes: Note[]) => {
    const noteIdSet = getNoteIdSet(notes);
    const loadedNoteIds = getLoadedNoteIdSet(notes);

    pruneParsedEditorContent(loadedNoteIds);
    pruneNoteContentLoadVersions(noteIdSet);
    pruneNoteContentStore(noteIdSet);

    set({
      notes,
      notesById: buildNotesById(notes),
      folderTree: buildTree(notes, get().directories),
      loadedNoteRecency: get().loadedNoteRecency.filter((noteId) =>
        loadedNoteIds.has(noteId),
      ),
    });
  },

  /**
   * Fetches the full content for a note if not already loaded.
   * Batches the store update (note flag + recency + LRU eviction) into a single set() call.
   */
  loadNoteContent: async (id: string) => {
    const note = get().notesById.get(id);
    if (!note || note.isContentLoaded) {
      return;
    }

    const existingLoad = inFlightNoteContentLoads.get(id);
    if (existingLoad) {
      await existingLoad;
      get().markNoteContentAccessed(id);
      return;
    }

    const requestVersion = (noteContentLoadVersions.get(id) ?? 0) + 1;
    noteContentLoadVersions.set(id, requestVersion);

    const loadPromise = (async () => {
      const content = await getNoteContentAction(id);
      const currentNote = get().notesById.get(id);

      if (!currentNote || currentNote.isContentLoaded) {
        return;
      }

      if (noteContentLoadVersions.get(id) !== requestVersion) {
        return;
      }

      // Store content outside Zustand
      noteContentStore.set(id, content || "");

      // Batch: update note flag + recency + LRU eviction in a single set()
      set((state) => {
        const updatedNote = {
          ...state.notesById.get(id)!,
          isContentLoaded: true,
          contentVersion: (state.notesById.get(id)?.contentVersion ?? 0) + 1,
        };

        const nextNotes = state.notes.map((n) =>
          n.id === id ? updatedNote : n,
        );
        const nextNotesById = new Map(state.notesById).set(id, updatedNote);

        // Compute recency: add loaded note to end
        const nextRecency = [
          ...getLoadedNoteRecency(state).filter((noteId) => noteId !== id),
          id,
        ];

        // Inline LRU eviction
        let loadedNoteCount = nextRecency.length;

        const evictedIds: string[] = [];
        if (loadedNoteCount > LOADED_NOTE_CACHE_LIMIT) {
          for (const recencyId of nextRecency) {
            if (loadedNoteCount <= LOADED_NOTE_CACHE_LIMIT) break;
            if (recencyId === state.selectedNoteId || recencyId === id)
              continue;

            evictedIds.push(recencyId);
            loadedNoteCount -= 1;
          }
        }

        // Apply evictions to notes array and map
        for (const evictId of evictedIds) {
          const evictNote = nextNotesById.get(evictId);
          if (evictNote?.isContentLoaded) {
            const unloaded = {
              ...evictNote,
              isContentLoaded: false,
              contentVersion: (evictNote.contentVersion ?? 0) + 1,
            };
            for (let i = 0; i < nextNotes.length; i++) {
              if (nextNotes[i].id === evictId) {
                nextNotes[i] = unloaded;
                break;
              }
            }
            nextNotesById.set(evictId, unloaded);
            noteContentStore.delete(evictId);
            clearParsedEditorContent(evictId);
            invalidateNoteContentLoad(evictId);
          }
        }

        const evictedIdSet = new Set(evictedIds);
        const finalRecency = nextRecency.filter((noteId) => {
          return !evictedIdSet.has(noteId);
        });

        return {
          notes: nextNotes,
          notesById: nextNotesById,
          loadedNoteRecency: finalRecency,
        };
      });
    })().finally(() => {
      if (inFlightNoteContentLoads.get(id) === loadPromise) {
        inFlightNoteContentLoads.delete(id);
      }
    });

    inFlightNoteContentLoads.set(id, loadPromise);
    await loadPromise;
  },

  /**
   * Marks a loaded note as recently accessed for bounded content caching.
   */
  markNoteContentAccessed: (id: string) => {
    const note = get().notesById.get(id);
    if (!note?.isContentLoaded) {
      return;
    }

    set((state) => ({
      loadedNoteRecency: [
        ...getLoadedNoteRecency(state).filter((noteId) => noteId !== id),
        id,
      ],
    }));

    get().pruneLoadedNoteContent();
  },

  /**
   * Releases a note's loaded content while preserving its metadata.
   */
  unloadNoteContent: (id: string) => {
    clearParsedEditorContent(id);
    noteContentStore.delete(id);
    invalidateNoteContentLoad(id);

    set((state) => {
      const nextLoadedNoteRecency = getLoadedNoteRecency(state).filter(
        (noteId) => noteId !== id,
      );
      const note = state.notesById.get(id);

      if (!note || !note.isContentLoaded) {
        return {
          loadedNoteRecency: nextLoadedNoteRecency,
        };
      }

      const updatedNote = {
        ...note,
        isContentLoaded: false,
        contentVersion: (note.contentVersion ?? 0) + 1,
      };
      const nextNotes = state.notes.map((currentNote) =>
        currentNote.id === id ? updatedNote : currentNote,
      );

      return {
        notes: nextNotes,
        notesById: new Map(state.notesById).set(id, updatedNote),
        loadedNoteRecency: nextLoadedNoteRecency,
      };
    });
  },

  /**
   * Releases all cached note content when no notes are open.
   * Clears both the raw content store and the parsed editor cache.
   */
  releaseAllNoteContent: () => {
    noteContentStore.clear();
    invalidateAllInFlightNoteContentLoads();
    inFlightNoteContentLoads.clear();
    pruneParsedEditorContent([]);

    const newNotes = get().notes.map((n) =>
      n.isContentLoaded
        ? {
            ...n,
            isContentLoaded: false,
            contentVersion: (n.contentVersion ?? 0) + 1,
          }
        : n,
    );

    set({
      notes: newNotes,
      notesById: buildNotesById(newNotes),
      loadedNoteRecency: [],
    });
  },

  /**
   * Evicts least-recently-used loaded notes when the in-memory cache grows too large.
   */
  pruneLoadedNoteContent: () => {
    const state = get();
    let loadedNoteCount = getLoadedNoteRecency(state).length;

    if (loadedNoteCount <= LOADED_NOTE_CACHE_LIMIT) {
      return;
    }

    for (const noteId of getLoadedNoteRecency(state)) {
      if (loadedNoteCount <= LOADED_NOTE_CACHE_LIMIT) {
        break;
      }

      if (noteId === state.selectedNoteId) {
        continue;
      }

      get().unloadNoteContent(noteId);
      loadedNoteCount -= 1;
    }
  },

  /**
   * Overwrites the current directories list and rebuilds the folder tree.
   */
  setDirectories: (directories: Directory[]) => {
    set({
      directories,
      folderTree: buildTree(get().notes, directories),
    });
  },

  /**
   * Synchronizes notes, directories, and tags from the database.
   */
  syncFromDb: (notes: Note[], directories: Directory[], tags?: Tag[]) => {
    const noteIdSet = getNoteIdSet(notes);
    const persistedOpenIds = get().openNoteIds.filter((id) =>
      noteIdSet.has(id),
    );
    const persistedSelectedNoteIds = new Set(
      Array.from(get().selectedNoteIds).filter((id) => noteIdSet.has(id)),
    );
    const persistedSelectedId =
      get().selectedNoteId && noteIdSet.has(get().selectedNoteId!)
        ? get().selectedNoteId
        : persistedOpenIds.length > 0
          ? persistedOpenIds[0]
          : null;

    pruneParsedEditorContent(getLoadedNoteIdSet(notes));
    pruneNoteContentLoadVersions(noteIdSet);
    pruneNoteContentStore(noteIdSet);

    set({
      notes,
      notesById: buildNotesById(notes),
      directories,
      ...(tags !== undefined && { tags }),
      folderTree: buildTree(notes, directories),
      isInitialized: true,
      openNoteIds: persistedOpenIds,
      selectedNoteIds: persistedSelectedNoteIds,
      selectedNoteId: persistedSelectedId,
      loadedNoteRecency: [],
      noteScrollPositions: Object.fromEntries(
        Object.entries(get().noteScrollPositions).filter(([noteId]) =>
          noteIdSet.has(noteId),
        ),
      ),
    });
  },

  /**
   * Creates a new directory in the database and store.
   */
  addDirectory: async (name: string, parentId: string | null) => {
    const { directories, notes } = get();

    // Check if directory already exists with same name and parentId
    const exists = directories.some(
      (d) => d.name === name && d.parentId === parentId,
    );

    if (exists) {
      toast.error(i18n.t("folder.alreadyExists"), { position: "bottom-left" });
      return;
    }

    const newDir: Directory = { id: crypto.randomUUID(), name, parentId };
    await saveDirectoryAction(newDir);
    const newDirs = [...directories, newDir];
    set({
      directories: newDirs,
      folderTree: buildTree(notes, newDirs),
    });
  },

  /**
   * Updates an existing directory's properties.
   */
  updateDirectory: async (id: string, updates: Partial<Directory>) => {
    const { directories, notes } = get();
    const dirToUpdate = directories.find((d) => d.id === id);

    if (!dirToUpdate) return;

    if (updates.name && updates.name !== dirToUpdate.name) {
      const newName = updates.name;

      // Check if directory already exists with same name and parentId
      const exists = directories.some(
        (d) =>
          d.id !== id &&
          d.name === newName &&
          d.parentId === dirToUpdate.parentId,
      );
      if (exists) {
        toast.error(i18n.t("folder.alreadyExists"), {
          position: "bottom-left",
        });
        return;
      }

      // Trigger DB update
      await updateDirectoryAction({ id, name: newName });

      const newDirectories = directories.map((dir) =>
        dir.id === id ? { ...dir, name: newName } : dir,
      );

      set({
        directories: newDirectories,
        folderTree: buildTree(notes, newDirectories),
      });
    }
  },

  /**
   * Moves a directory to a new parent.
   */
  moveDirectory: async (id: string, newParentId: string | null) => {
    const { directories, notes } = get();
    const dirToMove = directories.find((d) => d.id === id);
    if (!dirToMove) return;

    // --- Validation Checks ---

    // Check circular dependency: Cannot move parent into child
    const dirMap = new Map(directories.map((d) => [d.id, d]));
    const isDescendant = (
      parentId: string,
      childId: string | null,
    ): boolean => {
      if (!childId) return false;
      let curr = dirMap.get(childId);
      while (curr && curr.parentId) {
        if (curr.parentId === parentId) return true;
        const nextParentId = curr.parentId;
        curr = dirMap.get(nextParentId);
      }
      return false;
    };

    if (isDescendant(id, newParentId) || id === newParentId) {
      toast.error(i18n.t("folder.cannotMoveIntoChild"), {
        position: "bottom-left",
      });
      return;
    }

    // Check collision
    const exists = directories.some(
      (d) =>
        d.parentId === newParentId && d.name === dirToMove.name && d.id !== id,
    );

    if (exists) {
      toast.error(i18n.t("folder.alreadyExists"), { position: "bottom-left" });
      return;
    }

    // --- Perform DB Action ---
    const result = await moveDirectoryAction({ id, newParentId });
    if (!result.success) {
      toast.error(result.message || i18n.t("common.error"), {
        position: "bottom-left",
      });
      return;
    }

    // --- Update Local State ---
    const newDirectories = directories.map((d) =>
      d.id === id ? { ...d, parentId: newParentId } : d,
    );

    set({
      directories: newDirectories,
      folderTree: buildTree(notes, newDirectories),
    });
  },

  /**
   * Deletes a directory and all its subdirectories.
   * If deleteNotes is true, notes within deleted directories are permanently removed.
   * Otherwise, they are moved to Uncategorized.
   */
  deleteDirectory: async (id: string, deleteNotes = false) => {
    const oldDirs = get().directories;

    // Optimized descendant gathering using Map (O(N) instead of O(N^2))
    const parentMap = new Map<string, string[]>();
    oldDirs.forEach((d) => {
      if (d.parentId) {
        if (!parentMap.has(d.parentId)) parentMap.set(d.parentId, []);
        parentMap.get(d.parentId)!.push(d.id);
      }
    });

    const getLocalDescendants = (rootId: string) => {
      const result: string[] = [];
      const stack = [rootId];
      while (stack.length) {
        const curr = stack.pop()!;
        const children = parentMap.get(curr);
        if (children) {
          result.push(...children);
          stack.push(...children);
        }
      }
      return result;
    };

    const descendantIds = getLocalDescendants(id);
    const targetIds = new Set([id, ...descendantIds]);

    await deleteDirectoryAction(id, deleteNotes);

    const newDirs = oldDirs.filter((d) => !targetIds.has(d.id));

    const { selectedNoteId, openNoteIds } = get();
    let newNotes: Note[];

    if (deleteNotes) {
      // Collect affected note IDs first for UI cleanup
      const deletedNoteIds = new Set(
        get()
          .notes.filter((n) => n.directoryId && targetIds.has(n.directoryId))
          .map((n) => n.id),
      );

      // Remove notes that belonged to deleted directories
      newNotes = get().notes.filter(
        (note) => !note.directoryId || !targetIds.has(note.directoryId),
      );

      set({
        directories: newDirs,
        notes: newNotes,
        notesById: buildNotesById(newNotes),
        folderTree: buildTree(newNotes, newDirs),
        selectedNoteId: deletedNoteIds.has(selectedNoteId ?? "")
          ? null
          : selectedNoteId,
        openNoteIds: openNoteIds.filter((nid) => !deletedNoteIds.has(nid)),
        loadedNoteRecency: getLoadedNoteRecency(get()).filter(
          (noteId) => !deletedNoteIds.has(noteId),
        ),
        noteScrollPositions: Object.fromEntries(
          Object.entries(get().noteScrollPositions).filter(
            ([noteId]) => !deletedNoteIds.has(noteId),
          ),
        ),
      });

      deletedNoteIds.forEach((noteId) => {
        deleteNoteContentTracking(noteId);
      });
      pruneParsedEditorContent(getLoadedNoteIdSet(newNotes));
      pruneNoteContentLoadVersions(getNoteIdSet(newNotes));
    } else {
      // Move notes to Uncategorized
      newNotes = get().notes.map((note) => {
        if (note.directoryId && targetIds.has(note.directoryId)) {
          return { ...note, directoryId: null };
        }
        return note;
      });

      set({
        directories: newDirs,
        notes: newNotes,
        notesById: buildNotesById(newNotes),
        folderTree: buildTree(newNotes, newDirs),
      });
    }
  },

  /**
   * Deletes directories that have no notes in their subtree.
   */
  cleanupEmptyDirectories: async () => {
    const result = await cleanupEmptyDirectoriesAction();

    if (result.deletedIds.length === 0) {
      return 0;
    }

    const deletedIds = new Set(result.deletedIds);
    const { directories, notes } = get();
    const nextDirectories = directories.filter(
      (directory) => !deletedIds.has(directory.id),
    );

    set({
      directories: nextDirectories,
      folderTree: buildTree(notes, nextDirectories),
    });

    return result.deletedIds.length;
  },

  /**
   * Moves a note to a different directory.
   */
  moveNote: async (noteId: string, target: string | string[] | null) => {
    const note = get().notesById.get(noteId);
    if (note) {
      let targetDirectoryId: string | null = null;
      let folders: string[] = [];

      if (Array.isArray(target)) {
        // Resolve catalog to directoryId
        const noteWithContent = {
          ...note,
          content: getNoteContentFromStore(noteId),
        };
        const { directoryId } = await saveNoteAction(noteWithContent, target);
        targetDirectoryId = directoryId || null;
        folders = target;
      } else {
        targetDirectoryId = target;
        await updateNoteDirectoryAction(noteId, targetDirectoryId);
        if (targetDirectoryId) {
          folders = getDirPath(targetDirectoryId, get().directories);
        }
      }

      const updatedNote = {
        ...note,
        directoryId: targetDirectoryId,
        updatedAt: new Date().toISOString(),
      };
      const newNotes = get().notes.map((n) =>
        n.id === noteId ? updatedNote : n,
      );

      // Fetch updated directories as new ones might have been created
      const directories = await getDirectoriesAction();

      const newExpandedPaths = new Set(get().expandedPaths);
      if (folders.length > 0) {
        getExpandedPathsForCatalog(folders).forEach((path) => {
          newExpandedPaths.add(path);
        });
      }

      set({
        notes: newNotes,
        notesById: buildNotesById(newNotes),
        directories,
        folderTree: buildTree(newNotes, directories),
        expandedPaths: newExpandedPaths,
      });
    }
  },

  /**
   * Adds a tag to a specific note.
   */
  addTagToNote: async (noteId: string, tagId: string) => {
    const note = get().notesById.get(noteId);
    if (!note || note.tagIds.includes(tagId)) return;

    const newTagIds = [...note.tagIds, tagId];
    const updatedAt = new Date().toISOString();
    await setNoteTagIdsAction(noteId, newTagIds, updatedAt);

    set((state) =>
      updateSingleNoteInState(state, noteId, {
        tagIds: newTagIds,
        updatedAt,
      }),
    );
  },

  /**
   * Removes a tag from a specific note.
   */
  removeTagFromNote: async (noteId: string, tagId: string) => {
    const note = get().notesById.get(noteId);
    if (!note) return;

    const newTagIds = note.tagIds.filter((id) => id !== tagId);
    const updatedAt = new Date().toISOString();
    await setNoteTagIdsAction(noteId, newTagIds, updatedAt);

    set((state) =>
      updateSingleNoteInState(state, noteId, {
        tagIds: newTagIds,
        updatedAt,
      }),
    );
  },

  /**
   * Replaces all tags on a specific note.
   */
  setNoteTagIds: async (noteId: string, tagIds: string[]) => {
    const updatedAt = new Date().toISOString();
    await setNoteTagIdsAction(noteId, tagIds, updatedAt);

    set((state) =>
      updateSingleNoteInState(state, noteId, {
        tagIds,
        updatedAt,
      }),
    );
  },
});
