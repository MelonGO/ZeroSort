import { finalizePendingManagedImageFiles } from "@/lib/images";
import {
  CleanupPreviewResult,
  CleanupResult,
  DeleteTagsResult,
  Note,
  SaveNoteActionResult,
  SaveTagActionResult,
  SortBy,
  Tag,
  UpdateTagResult,
} from "@/types";
import {
  cleanupEmptyDirectoriesFromDb,
  deleteDirectoryFromDb,
  getAllDirectories,
  moveDirectory,
  previewEmptyDirectoriesFromDb,
  renameDirectory,
  saveDirectory,
} from "./db/directories";
import { rebuildLinksForNote } from "./db/noteLinks";
import {
  bulkDeleteNotesFromDb,
  bulkSaveNotes,
  deleteNoteFromDb,
  getAllNotes,
  getNoteContent,
  saveNote,
  updateNoteDirectory,
} from "./db/notes";
import {
  bulkSaveTags,
  cleanupUnusedTagsFromDb,
  deleteTagFromDb,
  deleteTagsFromDb,
  getAllTags,
  getTagById,
  getTagByName,
  previewUnusedTagsFromDb,
  renameTag,
  saveTag,
  setNoteTagIds as setNoteTagIdsDb,
  updateTagColor,
} from "./db/tags";

/**
 * Retrieves all notes from the database.
 *
 * @param sortBy - The field to sort by ('createdAt' or 'updatedAt').
 * @returns A promise that resolves to an array of Note objects.
 */
export const getNotesAction = async (sortBy: SortBy = "createdAt") => {
  return await getAllNotes(sortBy);
};

/**
 * Retrieves the full content of a note.
 *
 * @param id - The unique identifier of the note.
 * @returns A promise that resolves to the note content.
 */
export const getNoteContentAction = async (id: string) => {
  return await getNoteContent(id);
};

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

/**
 * Saves a note to the database.
 *
 * @param note - The note object to save.
 * @returns A promise that resolves to an object indicating success.
 */
export const saveNoteAction = async (
  note: Note,
  catalog?: string[],
  previousImagePaths?: string[],
): Promise<SaveNoteActionResult> => {
  const directoryId = await saveNote(note, catalog, previousImagePaths);
  const warnings: string[] = [];

  try {
    await finalizePendingManagedImageFiles(note.id, note.content || "");
  } catch (error) {
    console.error("Failed to reconcile pending managed images:", error);
    warnings.push(
      getActionErrorMessage(
        error,
        "Failed to reconcile pending managed images.",
      ),
    );
  }

  // Update bidirectional links
  try {
    await rebuildLinksForNote(note.id, note.content || "");

    const { useStore } = await import("@/store/useStore");
    if (useStore.getState().selectedNoteId === note.id) {
      await useStore.getState().loadNoteLinks(note.id);
    }
  } catch (error) {
    console.error("Failed to update note links:", error);
    warnings.push(getActionErrorMessage(error, "Failed to update note links."));
  }

  return { success: true, directoryId, warnings };
};

/**
 * Saves multiple notes to the database in bulk.
 *
 * @param data - Array of objects containing note and catalog.
 * @returns A promise that resolves to an object indicating success.
 */
export const bulkSaveNotesAction = async (
  data: { note: Note; catalog?: string[] }[],
) => {
  await bulkSaveNotes(data);

  // Rebuild derived note links for each saved note. Failures are logged
  // per-note but never abort the bulk save.
  for (const { note } of data) {
    try {
      await rebuildLinksForNote(note.id, note.content || "");
    } catch (error) {
      console.error(`Failed to rebuild note links for ${note.id}:`, error);
    }
  }

  return { success: true };
};

/**
 * Updates only the directory of a note.
 *
 * @param id - The unique identifier of the note.
 * @param directoryId - The new directory identifier.
 * @returns A promise that resolves to an object indicating success.
 */
export const updateNoteDirectoryAction = async (
  id: string,
  directoryId: string | null,
) => {
  await updateNoteDirectory(id, directoryId);
  return { success: true };
};

/**
 * Retrieves all directories from the database.
 *
 * @returns A promise that resolves to an array of directory objects.
 */
export const getDirectoriesAction = async () => {
  return await getAllDirectories();
};

/**
 * Saves a directory to the database.
 *
 * @param dir - The directory object to save.
 * @returns A promise that resolves to an object indicating success.
 */
export const saveDirectoryAction = async (dir: any) => {
  try {
    await saveDirectory(dir);
    return { success: true };
  } catch (error) {
    console.error("Failed to save directory:", error);
    return { success: false, message: (error as Error).message };
  }
};

/**
 * Updates a directory's name and syncs related notes.
 *
 * @param data - An object containing the directory ID and new name.
 * @param data.id - The unique identifier of the directory.
 * @param data.name - The new name for the directory.
 * @returns A promise that resolves to an object indicating success.
 */
export const updateDirectoryAction = async (data: {
  id: string;
  name: string;
}) => {
  await renameDirectory(data.id, data.name);
  return { success: true };
};

/**
 * Deletes a directory from the database.
 *
 * @param id - The unique identifier of the directory to delete.
 * @param deleteNotes - If true, notes are permanently deleted; otherwise moved to Uncategorized.
 * @returns A promise that resolves to an object indicating success.
 */
export const deleteDirectoryAction = async (
  id: string,
  deleteNotes = false,
) => {
  await deleteDirectoryFromDb(id, deleteNotes);
  return { success: true };
};

/** Deletes directories that have no notes in their subtree. */
export const cleanupEmptyDirectoriesAction =
  async (): Promise<CleanupResult> => {
    return await cleanupEmptyDirectoriesFromDb();
  };

/** Lists directories that would be deleted by empty-directory cleanup. */
export const previewEmptyDirectoriesAction =
  async (): Promise<CleanupPreviewResult> => {
    return await previewEmptyDirectoriesFromDb();
  };

/**
 * Deletes a note from the database.
 *
 * @param id - The unique identifier of the note to delete.
 * @returns A promise that resolves to an object indicating success.
 */
export const deleteNoteAction = async (id: string) => {
  await deleteNoteFromDb(id);
  return { success: true };
};

/**
 * Deletes multiple notes from the database in bulk.
 *
 * @param ids - Array of unique identifiers of the notes to delete.
 * @returns A promise that resolves to an object indicating success.
 */
export const bulkDeleteNotesAction = async (ids: string[]) => {
  await bulkDeleteNotesFromDb(ids);
  return { success: true };
};

/**
 * Moves a directory and syncs related notes.
 */
export const moveDirectoryAction = async (data: {
  id: string;
  newParentId: string | null;
}) => {
  try {
    await moveDirectory(data.id, data.newParentId);
    return { success: true };
  } catch (error) {
    console.error("Failed to move directory:", error);
    return { success: false, message: (error as Error).message };
  }
};

// --- Tag Actions ---

/** Retrieves all tags from the database. */
export const getTagsAction = async () => {
  return await getAllTags();
};

/** Retrieves a tag by its name. */
export const getTagByNameAction = async (name: string) => {
  return await getTagByName(name);
};

/** Saves a tag to the database. */
export const saveTagAction = async (tag: Tag): Promise<SaveTagActionResult> => {
  await saveTag(tag);
  return { success: true, tag };
};

/** Updates a tag's name and/or color. */
export const updateTagAction = async (data: {
  id: string;
  name?: string;
  color?: string | null;
}): Promise<UpdateTagResult> => {
  const renameResult = data.name ? await renameTag(data.id, data.name) : null;
  const targetTagId = renameResult?.targetTagId ?? data.id;

  if (data.color !== undefined) {
    await updateTagColor(targetTagId, data.color);
  }

  const tag = await getTagById(targetTagId);

  return {
    success: true,
    tag: tag ?? null,
    merge: renameResult?.merged ? renameResult : null,
  };
};

/** Deletes a tag from the database and updates affected notes. */
export const deleteTagAction = async (
  id: string,
): Promise<DeleteTagsResult> => {
  return await deleteTagFromDb(id);
};

/** Deletes multiple tags from the database and updates affected notes. */
export const deleteTagsAction = async (
  ids: string[],
): Promise<DeleteTagsResult> => {
  return await deleteTagsFromDb(ids);
};

/** Deletes tags that are not assigned to any notes. */
export const cleanupUnusedTagsAction = async (): Promise<CleanupResult> => {
  return await cleanupUnusedTagsFromDb();
};

/** Lists tags that would be deleted by unused-tag cleanup. */
export const previewUnusedTagsAction =
  async (): Promise<CleanupPreviewResult> => {
    return await previewUnusedTagsFromDb();
  };

/** Saves multiple tags in batch. */
export const bulkSaveTagsAction = async (tags: Tag[]) => {
  await bulkSaveTags(tags);
  return { success: true };
};

/** Sets tag IDs for a specific note. */
export const setNoteTagIdsAction = async (
  noteId: string,
  tagIds: string[],
  updatedAt?: string,
) => {
  await setNoteTagIdsDb(noteId, tagIds, updatedAt);
  return { success: true };
};
