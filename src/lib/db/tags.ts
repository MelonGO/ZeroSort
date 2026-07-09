import {
  CleanupPreviewResult,
  CleanupResult,
  DeleteTagsResult,
  Tag,
  TagRenameResult,
} from "@/types";
import { db } from "./index";

/**
 * Initializes the 'tags' and 'note_tags' tables in the database.
 * Must run after initNotesDb() due to foreign key reference.
 */
export async function initTagsDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    );
  `);

  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name
    ON tags(name);
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS note_tags (
      noteId TEXT NOT NULL,
      tagId TEXT NOT NULL,
      PRIMARY KEY (noteId, tagId),
      FOREIGN KEY (noteId) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_note_tags_tagId
    ON note_tags(tagId);
  `);
}

/**
 * Retrieves all tags from the database.
 */
export async function getAllTags(): Promise<Tag[]> {
  return await db.select<Tag[]>(
    "SELECT id, name, color, createdAt, updatedAt FROM tags ORDER BY name ASC",
  );
}

/**
 * Retrieves a tag by its ID.
 */
export async function getTagById(id: string): Promise<Tag | undefined> {
  const rows = await db.select<Tag[]>(
    "SELECT id, name, color, createdAt, updatedAt FROM tags WHERE id = $1",
    [id],
  );
  return rows[0];
}

/**
 * Saves or updates a tag in the database.
 */
export async function saveTag(tag: Tag) {
  await db.execute(
    `
    INSERT INTO tags (id, name, color, createdAt, updatedAt)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = excluded.color,
      updatedAt = excluded.updatedAt
    `,
    [tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt],
  );
}

/**
 * Updates a tag's color and timestamp.
 */
export async function updateTagColor(id: string, color: string | null) {
  await db.execute("UPDATE tags SET color = $1, updatedAt = $2 WHERE id = $3", [
    color,
    new Date().toISOString(),
    id,
  ]);
}

/**
 * Saves multiple tags in batch using chunked processing.
 */
export async function bulkSaveTags(tags: Tag[]) {
  if (tags.length === 0) return;

  const CHUNK_SIZE = 100;

  for (let i = 0; i < tags.length; i += CHUNK_SIZE) {
    const chunk = tags.slice(i, i + CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((tag, index) => {
      const base = index * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
      );
      values.push(tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt);
    });

    const sql = `
      INSERT INTO tags (id, name, color, createdAt, updatedAt)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        color = excluded.color,
        updatedAt = excluded.updatedAt
    `;

    await db.execute(sql, values);
  }
}

async function updateNotesUpdatedAt(noteIds: string[], updatedAt: string) {
  if (noteIds.length === 0) {
    return;
  }

  const CHUNK_SIZE = 500;

  for (let i = 0; i < noteIds.length; i += CHUNK_SIZE) {
    const chunk = noteIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 2}`).join(", ");

    await db.execute(
      `UPDATE notes SET updatedAt = $1 WHERE id IN (${placeholders})`,
      [updatedAt, ...chunk],
    );
  }
}

async function getAffectedNoteIdsForTagIds(
  tagIds: string[],
): Promise<string[]> {
  if (tagIds.length === 0) {
    return [];
  }

  const CHUNK_SIZE = 500;
  const noteIds = new Set<string>();

  for (let i = 0; i < tagIds.length; i += CHUNK_SIZE) {
    const chunk = tagIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await db.select<{ noteId: string }[]>(
      `SELECT DISTINCT noteId FROM note_tags WHERE tagId IN (${placeholders})`,
      chunk,
    );

    for (const row of rows) {
      noteIds.add(row.noteId);
    }
  }

  return [...noteIds];
}

async function getUnusedTagIds(): Promise<string[]> {
  const rows = await db.select<{ id: string }[]>(`
    SELECT tags.id
    FROM tags
    LEFT JOIN note_tags ON note_tags.tagId = tags.id
    WHERE note_tags.tagId IS NULL
  `);

  return rows.map((row) => row.id);
}

/**
 * Lists tags that are not assigned to any notes.
 */
export async function previewUnusedTagsFromDb(): Promise<CleanupPreviewResult> {
  const rows = await db.select<{ id: string; name: string }[]>(`
    SELECT tags.id, tags.name
    FROM tags
    LEFT JOIN note_tags ON note_tags.tagId = tags.id
    WHERE note_tags.tagId IS NULL
    ORDER BY tags.name ASC
  `);

  return {
    items: rows.map((row) => ({ id: row.id, label: row.name })),
  };
}

/**
 * Deletes a tag from the database. CASCADE handles note_tags cleanup.
 */
export async function deleteTagFromDb(id: string): Promise<DeleteTagsResult> {
  const affectedNoteIds = await getAffectedNoteIdsForTagIds([id]);
  const noteUpdatedAt =
    affectedNoteIds.length > 0 ? new Date().toISOString() : undefined;

  if (noteUpdatedAt) {
    await updateNotesUpdatedAt(affectedNoteIds, noteUpdatedAt);
  }

  await db.execute("DELETE FROM tags WHERE id = $1", [id]);

  return {
    success: true,
    deletedTagIds: [id],
    affectedNoteIds,
    noteUpdatedAt,
  };
}

/**
 * Deletes multiple tags from the database. CASCADE handles note_tags cleanup.
 */
export async function deleteTagsFromDb(
  ids: string[],
): Promise<DeleteTagsResult> {
  if (ids.length === 0) {
    return {
      success: true,
      deletedTagIds: [],
      affectedNoteIds: [],
    };
  }

  const affectedNoteIds = await getAffectedNoteIdsForTagIds(ids);
  const noteUpdatedAt =
    affectedNoteIds.length > 0 ? new Date().toISOString() : undefined;

  if (noteUpdatedAt) {
    await updateNotesUpdatedAt(affectedNoteIds, noteUpdatedAt);
  }

  const CHUNK_SIZE = 500;

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
    await db.execute(`DELETE FROM tags WHERE id IN (${placeholders})`, chunk);
  }

  return {
    success: true,
    deletedTagIds: [...ids],
    affectedNoteIds,
    noteUpdatedAt,
  };
}

/**
 * Deletes tags that are not assigned to any notes.
 */
export async function cleanupUnusedTagsFromDb(): Promise<CleanupResult> {
  const ids = await getUnusedTagIds();

  if (ids.length === 0) {
    return { success: true, deletedIds: [] };
  }

  const result = await deleteTagsFromDb(ids);
  return {
    success: result.success,
    deletedIds: result.deletedTagIds,
  };
}

/**
 * Renames a tag. If a tag with the new name already exists, merges them.
 */
export async function renameTag(
  id: string,
  newName: string,
): Promise<TagRenameResult> {
  const existing = await getTagByName(newName);

  if (existing && existing.id !== id) {
    const affectedRows = await db.select<{ noteId: string }[]>(
      "SELECT DISTINCT noteId FROM note_tags WHERE tagId = $1",
      [id],
    );
    const affectedNoteIds = affectedRows.map((row) => row.noteId);
    const noteUpdatedAt = new Date().toISOString();

    // Merge: reassign note_tags from source to target, then delete source
    await db.execute(
      `
      INSERT OR IGNORE INTO note_tags (noteId, tagId)
      SELECT noteId, $1 FROM note_tags WHERE tagId = $2
      `,
      [existing.id, id],
    );

    if (affectedNoteIds.length > 0) {
      await updateNotesUpdatedAt(affectedNoteIds, noteUpdatedAt);
    }

    await db.execute("DELETE FROM tags WHERE id = $1", [id]);

    return {
      merged: true,
      sourceTagId: id,
      targetTagId: existing.id,
      affectedNoteIds,
      noteUpdatedAt,
    };
  } else {
    const now = new Date().toISOString();
    await db.execute(
      "UPDATE tags SET name = $1, updatedAt = $2 WHERE id = $3",
      [newName, now, id],
    );

    return {
      merged: false,
      sourceTagId: id,
      targetTagId: id,
      affectedNoteIds: [],
    };
  }
}

/**
 * Retrieves a tag by its name.
 */
export async function getTagByName(name: string): Promise<Tag | undefined> {
  const rows = await db.select<Tag[]>(
    "SELECT id, name, color, createdAt, updatedAt FROM tags WHERE name = $1",
    [name],
  );
  return rows[0];
}

/**
 * Sets the tag IDs for a specific note. Replaces all existing assignments.
 */
export async function setNoteTagIds(
  noteId: string,
  tagIds: string[],
  updatedAt?: string,
) {
  await db.execute("DELETE FROM note_tags WHERE noteId = $1", [noteId]);

  if (updatedAt) {
    await db.execute("UPDATE notes SET updatedAt = $1 WHERE id = $2", [
      updatedAt,
      noteId,
    ]);
  }

  if (tagIds.length === 0) return;

  // Filter to only tag IDs that exist in the tags table to prevent FK violations
  // (e.g. orphaned tag references in synced notes, or failed tag downloads)
  const filterPlaceholders = tagIds.map((_, i) => `$${i + 1}`).join(", ");
  const existingTags = await db.select<{ id: string }[]>(
    `SELECT id FROM tags WHERE id IN (${filterPlaceholders})`,
    tagIds,
  );
  const validTagIds = new Set(existingTags.map((t) => t.id));
  const filteredTagIds = tagIds.filter((id) => validTagIds.has(id));

  if (filteredTagIds.length === 0) return;

  const placeholders: string[] = [];
  const values: unknown[] = [];

  filteredTagIds.forEach((tagId, index) => {
    const base = index * 2;
    placeholders.push(`($${base + 1}, $${base + 2})`);
    values.push(noteId, tagId);
  });

  await db.execute(
    `INSERT OR IGNORE INTO note_tags (noteId, tagId) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

/**
 * Batch version of setNoteTagIds for sync/import operations.
 */
export async function bulkSetNoteTagIds(
  entries: { noteId: string; tagIds: string[] }[],
) {
  if (entries.length === 0) return;

  // Delete existing assignments for all notes in a batch
  const CHUNK_SIZE = 500;
  const noteIds = entries.map((e) => e.noteId);

  for (let i = 0; i < noteIds.length; i += CHUNK_SIZE) {
    const chunk = noteIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
    await db.execute(
      `DELETE FROM note_tags WHERE noteId IN (${placeholders})`,
      chunk,
    );
  }

  // Collect all unique tag IDs and filter to those that exist in the tags table
  const allTagIds = [...new Set(entries.flatMap((e) => e.tagIds))];
  let validTagIds = new Set<string>();

  if (allTagIds.length > 0) {
    for (let i = 0; i < allTagIds.length; i += CHUNK_SIZE) {
      const chunk = allTagIds.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
      const rows = await db.select<{ id: string }[]>(
        `SELECT id FROM tags WHERE id IN (${placeholders})`,
        chunk,
      );
      for (const row of rows) validTagIds.add(row.id);
    }
  }

  // Collect all (noteId, tagId) pairs, skipping invalid tag IDs
  const pairs: [string, string][] = [];
  for (const { noteId, tagIds } of entries) {
    for (const tagId of tagIds) {
      if (validTagIds.has(tagId)) {
        pairs.push([noteId, tagId]);
      }
    }
  }

  const PAIR_CHUNK_SIZE = 250; // 2 params per pair = 500 max
  for (let i = 0; i < pairs.length; i += PAIR_CHUNK_SIZE) {
    const chunk = pairs.slice(i, i + PAIR_CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach(([noteId, tagId], index) => {
      const base = index * 2;
      placeholders.push(`($${base + 1}, $${base + 2})`);
      values.push(noteId, tagId);
    });

    await db.execute(
      `INSERT OR IGNORE INTO note_tags (noteId, tagId) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
}

/**
 * Batch-fetches tag IDs for a list of note IDs.
 */
export async function getTagIdsForNotes(
  noteIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (noteIds.length === 0) return result;

  const CHUNK_SIZE = 500;

  for (let i = 0; i < noteIds.length; i += CHUNK_SIZE) {
    const chunk = noteIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await db.select<{ noteId: string; tagId: string }[]>(
      `SELECT noteId, tagId FROM note_tags WHERE noteId IN (${placeholders})`,
      chunk,
    );

    for (const row of rows) {
      if (!result.has(row.noteId)) {
        result.set(row.noteId, []);
      }
      result.get(row.noteId)!.push(row.tagId);
    }
  }

  return result;
}
