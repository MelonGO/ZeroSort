import {
  deleteManagedImageFile,
  extractManagedImagePathsFromContent,
  getRemovedManagedImagePaths,
} from "@/lib/images";
import { Note, SortBy } from "@/types";
import { getDirectoryByNameAndParent, saveDirectory } from "./directories";
import { db } from "./index";
import { getTagIdsForNotes, setNoteTagIds } from "./tags";

/**
 * Initializes the 'notes' table in the database if it doesn't exist.
 *
 * @returns A promise that resolves when the table is created.
 */
export async function initNotesDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      directoryId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );
  `);
}

/**
 * Retrieves all notes from the database, sorted by the specified field.
 * Note: This version excludes the 'content' field for better performance.
 *
 * @param sortBy - The field to sort by ('createdAt' or 'updatedAt').
 * @returns A promise that resolves to an array of Note objects with parsed catalogs.
 */
export async function getAllNotes(
  sortBy: SortBy = "createdAt",
): Promise<Note[]> {
  const orderField =
    sortBy === "updatedAt" ? "COALESCE(updatedAt, createdAt)" : "createdAt";
  // Exclude 'content' from the selection to optimize loading speed
  const rows = await db.select<any[]>(
    `SELECT id, title, summary, directoryId, createdAt, updatedAt FROM notes ORDER BY ${orderField} DESC`,
  );

  const noteIds = rows.map((row) => row.id);
  const tagIdsMap = await getTagIdsForNotes(noteIds);

  return rows.map((row) => ({
    ...row,
    content: "", // Content is loaded on demand
    isContentLoaded: false,
    directoryId: row.directoryId || null,
    tagIds: tagIdsMap.get(row.id) || [],
  }));
}

/**
 * Retrieves all notes with their full content from the database.
 * Used for export/sync operations.
 *
 * @param sortBy - The field to sort by ('createdAt' or 'updatedAt').
 * @returns A promise that resolves to an array of Note objects with full content.
 */
export async function getAllNotesWithContent(
  sortBy: SortBy = "createdAt",
): Promise<Note[]> {
  const orderField =
    sortBy === "updatedAt" ? "COALESCE(updatedAt, createdAt)" : "createdAt";
  const rows = await db.select<any[]>(
    `SELECT id, title, summary, content, directoryId, createdAt, updatedAt FROM notes ORDER BY ${orderField} DESC`,
  );

  const noteIds = rows.map((row) => row.id);
  const tagIdsMap = await getTagIdsForNotes(noteIds);

  return rows.map((row) => ({
    ...row,
    isContentLoaded: true,
    directoryId: row.directoryId || null,
    tagIds: tagIdsMap.get(row.id) || [],
  }));
}

/**
 * Retrieves a single note with its full content and tag IDs.
 *
 * @param id - The unique identifier of the note.
 * @returns A promise that resolves to the note object or undefined if not found.
 */
export async function getNoteByIdWithContent(
  id: string,
): Promise<Note | undefined> {
  const rows = await db.select<any[]>(
    "SELECT id, title, summary, content, directoryId, createdAt, updatedAt FROM notes WHERE id = $1",
    [id],
  );
  const row = rows[0];

  if (!row) {
    return undefined;
  }

  const tagIdsMap = await getTagIdsForNotes([id]);

  return {
    ...row,
    isContentLoaded: true,
    directoryId: row.directoryId || null,
    tagIds: tagIdsMap.get(row.id) || [],
  };
}

/**
 * Retrieves the full content of a specific note.
 *
 * @param id - The unique identifier of the note.
 * @returns A promise that resolves to the note content or undefined if not found.
 */
export async function getNoteContent(id: string): Promise<string | undefined> {
  const rows = await db.select<any[]>(
    "SELECT content FROM notes WHERE id = $1",
    [id],
  );
  return rows[0]?.content;
}

/**
 * Ensures that all directories in a given catalog path exist in the database.
 *
 * @param catalog - An array of folder names representing a hierarchical path.
 * @returns A promise that resolves when all directories are confirmed to exist.
 */
export async function ensureDirectoriesExist(
  catalog: string[],
): Promise<string | null> {
  let parentId: string | null = null;
  for (const folderName of catalog) {
    let dir = await getDirectoryByNameAndParent(folderName, parentId);
    if (!dir) {
      const newId = crypto.randomUUID();
      dir = { id: newId, name: folderName, parentId };
      await saveDirectory(dir);
    }
    parentId = dir.id;
  }
  return parentId;
}

/**
 * Saves or updates a note in the database and ensures its directory structure exists.
 *
 * @param note - The note object to save.
 * @returns A promise that resolves when the note and its directories are saved.
 */
export async function saveNote(
  note: Note,
  catalog?: string[],
  previousImagePaths?: string[],
): Promise<string | null> {
  let directoryId = note.directoryId;

  let removedImagePaths: string[] = [];
  if (previousImagePaths !== undefined) {
    // Caller provided pre-extracted paths — skip the expensive content re-read
    const nextPaths = new Set(
      extractManagedImagePathsFromContent(note.content || "", note.id),
    );
    removedImagePaths = previousImagePaths.filter(
      (path) => !nextPaths.has(path),
    );
  } else {
    const previousContent = await getNoteContent(note.id);
    if (previousContent !== note.content) {
      removedImagePaths = getRemovedManagedImagePaths(
        previousContent || "",
        note.content || "",
        note.id,
      );
    }
  }

  if (catalog && catalog.length > 0) {
    directoryId = await ensureDirectoriesExist(catalog);
  }

  // SQLite ON CONFLICT for the host DB wrapper
  await db.execute(
    `
    INSERT INTO notes (id, title, summary, content, directoryId, createdAt, updatedAt)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      content = excluded.content,
      directoryId = excluded.directoryId,
      createdAt = excluded.createdAt,
      updatedAt = excluded.updatedAt
  `,
    [
      note.id,
      note.title,
      note.summary,
      note.content,
      directoryId,
      note.createdAt,
      note.updatedAt,
    ],
  );

  if (removedImagePaths.length > 0) {
    try {
      await deleteManagedImages(removedImagePaths);
    } catch (error) {
      console.error("Failed to delete removed managed images:", error);
    }
  }

  // Sync note_tags junction table
  if (note.tagIds) {
    await setNoteTagIds(note.id, note.tagIds);
  }

  return directoryId;
}

/**
 * Updates only the directory identifier of a note.
 *
 * @param id - The unique identifier of the note.
 * @param directoryId - The new directory identifier.
 */
export async function updateNoteDirectory(
  id: string,
  directoryId: string | null,
) {
  const updatedAt = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET directoryId = $1, updatedAt = $2 WHERE id = $3",
    [directoryId, updatedAt, id],
  );
}

/**
 * Deletes a note from the database by its unique identifier.
 *
 * @param id - The unique identifier of the note to delete.
 * @returns A promise that resolves when the note is deleted.
 */
export async function deleteNoteFromDb(id: string) {
  const imagePaths = await getManagedImagePathsForNoteIds([id]);
  await deleteManagedImages(imagePaths);
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
}

/**
 * Saves multiple notes in batch.
 *
 * FIX: Replaced manual transaction management (BEGIN/COMMIT) with batched INSERT statements.
 * Manual transactions are wrapped by the host SQLite layer.
 *
 * @param notesWithCatalogs - Array of objects containing note and its catalog path.
 */
export async function bulkSaveNotes(
  notesWithCatalogs: { note: Note; catalog?: string[] }[],
) {
  const dirCache = new Map<string, string | null>();
  const processedNotes: Note[] = [];

  // 1. Pre-process directories sequentially
  // This ensures directories exist before we try to insert notes in bulk.
  for (const { note, catalog } of notesWithCatalogs) {
    let directoryId = note.directoryId;

    if (catalog && catalog.length > 0) {
      const pathKey = catalog.join("/");
      if (dirCache.has(pathKey)) {
        directoryId = dirCache.get(pathKey)!;
      } else {
        directoryId = await ensureDirectoriesExist(catalog);
        dirCache.set(pathKey, directoryId);
      }
    }
    processedNotes.push({ ...note, directoryId });
  }

  // 2. Insert notes in chunks
  // SQLite limits the number of bind parameters (defaults often vary between 999 and 32766).
  // We have 7 fields per note. A chunk size of 100 results in 700 parameters, which is safe.
  const CHUNK_SIZE = 100;

  for (let i = 0; i < processedNotes.length; i += CHUNK_SIZE) {
    const chunk = processedNotes.slice(i, i + CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: any[] = [];

    chunk.forEach((note, index) => {
      // Calculate parameter offsets ($1, $2, etc.)
      const base = index * 7;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`,
      );

      values.push(
        note.id,
        note.title,
        note.summary,
        note.content,
        note.directoryId,
        note.createdAt,
        note.updatedAt,
      );
    });

    const sql = `
      INSERT INTO notes (id, title, summary, content, directoryId, createdAt, updatedAt)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        summary = excluded.summary,
        content = excluded.content,
        directoryId = excluded.directoryId,
        createdAt = excluded.createdAt,
        updatedAt = excluded.updatedAt
    `;

    await db.execute(sql, values);
  }

  // 3. Sync note_tags junction table for notes that have tagIds
  const tagEntries = processedNotes
    .filter((note) => note.tagIds && note.tagIds.length > 0)
    .map((note) => ({ noteId: note.id, tagIds: note.tagIds }));

  if (tagEntries.length > 0) {
    const { bulkSetNoteTagIds } = await import("./tags");
    await bulkSetNoteTagIds(tagEntries);
  }
}

/**
 * Deletes multiple notes from the database in bulk.
 *
 * @param ids - Array of unique identifiers of the notes to delete.
 */
export async function bulkDeleteNotesFromDb(ids: string[]) {
  if (ids.length === 0) return;

  const imagePaths = await getManagedImagePathsForNoteIds(ids);
  await deleteManagedImages(imagePaths);

  // SQLite limits parameters, so we chunk it just in case
  const CHUNK_SIZE = 500;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
    await db.execute(`DELETE FROM notes WHERE id IN (${placeholders})`, chunk);
  }
}

async function getManagedImagePathsForNoteIds(
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }

  const uniquePaths = new Set<string>();
  const CHUNK_SIZE = 500;

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await db.select<{ id: string; content: string | null }[]>(
      `SELECT id, content FROM notes WHERE id IN (${placeholders})`,
      chunk,
    );

    for (const row of rows) {
      const imagePaths = extractManagedImagePathsFromContent(
        row.content || "",
        row.id,
      );
      imagePaths.forEach((path) => {
        uniquePaths.add(path);
      });
    }
  }

  return Array.from(uniquePaths);
}

async function deleteManagedImages(imagePaths: string[]): Promise<void> {
  for (const imagePath of imagePaths) {
    await deleteManagedImageFile(imagePath);
  }
}
