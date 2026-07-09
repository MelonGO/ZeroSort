import {
  deleteManagedImageFile,
  extractManagedImagePathsFromContent,
} from "@/lib/images";
import { CleanupPreviewResult, CleanupResult, Directory } from "@/types";
import { t } from "i18next";
import { db } from "./index";

/**
 * Initializes the 'directories' table in the database if it doesn't exist.
 *
 * @returns A promise that resolves when the table is created.
 */
export async function initDirectoriesDb() {
  await db.execute(`
        CREATE TABLE IF NOT EXISTS directories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parentId TEXT,
            path TEXT, -- Full path string, e.g., "Work/Projects"
            updatedAt TEXT
        );
    `);

  // 1. Enforce uniqueness for subdirectories (where parentId is NOT NULL)
  await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_directories_name_parent 
        ON directories(name, parentId) 
        WHERE parentId IS NOT NULL;
    `);

  // 2. Enforce uniqueness for root directories (where parentId IS NULL)
  await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_directories_name_root 
        ON directories(name) 
        WHERE parentId IS NULL;
    `);
}

/**
 * Retrieves all directories from the database.
 *
 * @returns A promise that resolves to an array of Directory objects.
 */
export async function getAllDirectories(): Promise<Directory[]> {
  return await db.select<Directory[]>("SELECT * FROM directories");
}

/**
 * Saves or updates a directory in the database.
 * Checks for duplicate names in the same parent folder before saving.
 *
 * @param directory - The directory object to save.
 * @returns A promise that resolves when the directory is saved.
 */
export async function saveDirectory(directory: Directory) {
  // Check if a directory with the same name and parent already exists
  const existingDir = await getDirectoryByNameAndParent(
    directory.name,
    directory.parentId,
  );

  // If it exists AND it has a different ID, that's a collision
  if (existingDir && existingDir.id !== directory.id) {
    throw new Error(
      `A directory with the name "${directory.name}" already exists in this location.`,
    );
  }

  const now = new Date().toISOString();
  await db.execute(
    `
    INSERT INTO directories (id, name, parentId, path, updatedAt)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      parentId = excluded.parentId,
      path = excluded.path,
      updatedAt = excluded.updatedAt
  `,
    [
      directory.id,
      directory.name,
      directory.parentId,
      directory.path || null,
      directory.updatedAt || now,
    ],
  );
}

/**
 * Saves multiple directories in batch.
 * Uses chunked processing to avoid SQLite parameter limits.
 *
 * @param directories - Array of directory objects to save.
 */
export async function bulkSaveDirectories(directories: Directory[]) {
  if (directories.length === 0) return;

  const CHUNK_SIZE = 100;
  const now = new Date().toISOString();

  for (let i = 0; i < directories.length; i += CHUNK_SIZE) {
    const chunk = directories.slice(i, i + CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((dir, index) => {
      const base = index * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
      );

      values.push(
        dir.id,
        dir.name,
        dir.parentId,
        dir.path || null,
        dir.updatedAt || now,
      );
    });

    const sql = `
      INSERT INTO directories (id, name, parentId, path, updatedAt)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        parentId = excluded.parentId,
        path = excluded.path,
        updatedAt = excluded.updatedAt
    `;

    await db.execute(sql, values);
  }
}

/**
 * Deletes a directory and all its descendants from the database.
 * Reassigns notes in deleted directories to 'Uncategorized'.
 * Optimized using single SQL statements for reassignment and deletion.
 *
 * @param id - The unique identifier of the directory to delete.
 * @returns A promise that resolves when the deletion and reassignment are complete.
 */
export async function deleteDirectoryFromDb(id: string, deleteNotes = false) {
  const dir = await getDirectoryById(id);
  if (!dir) return;

  const allDirs = await getAllDirectories();
  const descendants = getDescendantIds(id, allDirs);
  const targetIds = [id, ...descendants];

  try {
    const idPlaceholders = targetIds.map((_, i) => `$${i + 1}`).join(", ");
    const now = new Date().toISOString();

    if (deleteNotes) {
      const noteRows = await db.select<
        { id: string; content: string | null }[]
      >(
        `SELECT id, content FROM notes WHERE directoryId IN (${idPlaceholders})`,
        targetIds,
      );
      const managedImagePaths = new Set<string>();

      for (const row of noteRows) {
        const imagePaths = extractManagedImagePathsFromContent(
          row.content || "",
          row.id,
        );
        imagePaths.forEach((imagePath) => {
          managedImagePaths.add(imagePath);
        });
      }

      for (const imagePath of managedImagePaths) {
        await deleteManagedImageFile(imagePath);
      }

      // Permanently delete notes belonging to these directories
      const deleteSql = `DELETE FROM notes WHERE directoryId IN (${idPlaceholders})`;
      await db.execute(deleteSql, targetIds);
    } else {
      // Reassign notes to Uncategorized and bump updatedAt so sync sees the note move.
      const updatedAtPlaceholder = `$${targetIds.length + 1}`;
      const updateSql = `UPDATE notes SET directoryId = NULL, updatedAt = ${updatedAtPlaceholder} WHERE directoryId IN (${idPlaceholders})`;
      await db.execute(updateSql, [...targetIds, now]);
    }

    // Delete directories in bulk
    for (const did of targetIds) {
      await db.execute("DELETE FROM directories WHERE id = $1", [did]);
    }
  } catch (error) {
    console.error("Delete failed", error);
    throw error;
  }
}

/**
 * Retrieves a single directory by its unique identifier.
 *
 * @param id - The unique identifier of the directory.
 * @returns A promise that resolves to the directory object or undefined if not found.
 */
export async function getDirectoryById(
  id: string,
): Promise<Directory | undefined> {
  const rows = await db.select<Directory[]>(
    "SELECT * FROM directories WHERE id = $1",
    [id],
  );
  return rows[0];
}

/**
 * Recursively retrieves all descendant IDs for a given directory.
 * Optimized to use an iterative approach with a Map for O(N) performance.
 *
 * @param id - The unique identifier of the parent directory.
 * @param allDirs - An array of all directories to search within.
 * @returns An array of strings representing descendant directory IDs.
 */
function getDescendantIds(id: string, allDirs: Directory[]): string[] {
  // Build an adjacency list for O(1) lookup
  const parentMap = new Map<string, Directory[]>();
  for (const d of allDirs) {
    if (d.parentId) {
      if (!parentMap.has(d.parentId)) {
        parentMap.set(d.parentId, []);
      }
      parentMap.get(d.parentId)!.push(d);
    }
  }

  const descendants: string[] = [];
  const stack = [id];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    const children = parentMap.get(currentId);
    if (children) {
      for (const child of children) {
        descendants.push(child.id);
        stack.push(child.id);
      }
    }
  }
  return descendants;
}

function sortDirectoriesByDepthDesc(directories: Directory[]): Directory[] {
  const dirMap = new Map(
    directories.map((directory) => [directory.id, directory]),
  );

  const getDepth = (directory: Directory) => {
    let depth = 0;
    let currentParentId = directory.parentId;

    while (currentParentId) {
      depth += 1;
      currentParentId = dirMap.get(currentParentId)?.parentId ?? null;
    }

    return depth;
  };

  return [...directories].sort(
    (left, right) => getDepth(right) - getDepth(left),
  );
}

async function getEmptyDirectoryIds(): Promise<string[]> {
  const [directories, noteRows] = await Promise.all([
    getAllDirectories(),
    db.select<{ directoryId: string }[]>(
      "SELECT DISTINCT directoryId FROM notes WHERE directoryId IS NOT NULL",
    ),
  ]);

  if (directories.length === 0) {
    return [];
  }

  const directoriesByParent = new Map<string | null, Directory[]>();
  directories.forEach((directory) => {
    const siblings = directoriesByParent.get(directory.parentId) ?? [];
    siblings.push(directory);
    directoriesByParent.set(directory.parentId, siblings);
  });

  const usedDirectoryIds = new Set(noteRows.map((row) => row.directoryId));
  const hasNotesInSubtree = new Map<string, boolean>();

  const visit = (directoryId: string) => {
    const children = directoriesByParent.get(directoryId) ?? [];
    let isUsed = usedDirectoryIds.has(directoryId);

    for (const child of children) {
      if (visit(child.id)) {
        isUsed = true;
      }
    }

    hasNotesInSubtree.set(directoryId, isUsed);
    return isUsed;
  };

  (directoriesByParent.get(null) ?? []).forEach((directory) => {
    visit(directory.id);
  });

  return sortDirectoriesByDepthDesc(
    directories.filter((directory) => !hasNotesInSubtree.get(directory.id)),
  ).map((directory) => directory.id);
}

/**
 * Lists directories that have no notes in their subtree.
 */
export async function previewEmptyDirectoriesFromDb(): Promise<CleanupPreviewResult> {
  const directories = await getAllDirectories();
  const directoryIds = await getEmptyDirectoryIds();
  const labelsById = new Map(
    directories.map((directory) => [
      directory.id,
      getDirectoryPath(directory.id, directories).join(" / "),
    ]),
  );

  return {
    items: directoryIds.map((id) => ({
      id,
      label: labelsById.get(id) ?? id,
    })),
  };
}

/**
 * Retrieves the full path of a directory as an array of names.
 *
 * @param id - The unique identifier of the directory.
 * @param allDirs - An array of all directories to search within.
 * @returns An array of strings representing the directory path names.
 */
function getDirectoryPath(id: string, allDirs: Directory[]): string[] {
  const dir = allDirs.find((d) => d.id === id);
  if (!dir) return [];
  if (!dir.parentId) return [dir.name];
  return [...getDirectoryPath(dir.parentId, allDirs), dir.name];
}

/**
 * Checks if a given path is a sub-path of another.
 *
 * @param parent - The parent path as an array of names.
 * @param child - The potential child path as an array of names.
 * @returns True if the child path starts with the parent path.
 */
function isSubPath(parent: string[], child: string[]): boolean {
  if (parent.length > child.length) return false;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== child[i]) return false;
  }
  return true;
}

/**
 * Renames a directory and updates the catalog of all notes within it and its subdirectories.
 * Optimized using SQLite JSON functions to perform bulk updates in a single query.
 *
 * @param id - The unique identifier of the directory to rename.
 * @param newName - The new name for the directory.
 * @returns A promise that resolves when the rename and sync are complete.
 */
export async function renameDirectory(id: string, newName: string) {
  const dir = await getDirectoryById(id);
  if (!dir || dir.name === newName) return;

  const existingDir = await getDirectoryByNameAndParent(newName, dir.parentId);

  try {
    if (existingDir && existingDir.id !== id) {
      throw new Error(t("folder.alreadyExists"));
    }

    const now = new Date().toISOString();
    await db.execute(
      "UPDATE directories SET name = $1, updatedAt = $2 WHERE id = $3",
      [newName, now, id],
    );
  } catch (error) {
    console.error("Rename failed", error);
    throw error;
  }
}

/**
 * Retrieves a directory by its name and parent identifier.
 *
 * @param name - The name of the directory.
 * @param parentId - The unique identifier of the parent directory (or null for root).
 * @returns A promise that resolves to the directory object or undefined if not found.
 */
export async function getDirectoryByNameAndParent(
  name: string,
  parentId: string | null,
): Promise<Directory | undefined> {
  const rows = parentId
    ? await db.select<Directory[]>(
        "SELECT * FROM directories WHERE name = $1 AND parentId = $2",
        [name, parentId],
      )
    : await db.select<Directory[]>(
        "SELECT * FROM directories WHERE name = $1 AND parentId IS NULL",
        [name],
      );

  return rows[0];
}
/**
 * Moves a directory to a new parent and updates the catalog of all affected notes.
 *
 * @param id - The ID of the directory to move.
 * @param newParentId - The ID of the new parent directory (or null for root).
 */
export async function moveDirectory(id: string, newParentId: string | null) {
  const allDirs = await getAllDirectories();
  const dir = allDirs.find((d) => d.id === id);
  if (!dir) throw new Error("Directory not found");

  // 0. Circular Dependency Check
  if (newParentId) {
    const descendants = getDescendantIds(id, allDirs);
    if (descendants.includes(newParentId) || id === newParentId) {
      throw new Error(t("folder.cannotMoveIntoChild"));
    }
  }

  // 1. Check if same name exists in new location
  const existing = await getDirectoryByNameAndParent(dir.name, newParentId);
  if (existing && existing.id !== id) {
    throw new Error(t("folder.alreadyExists"));
  }

  try {
    // 2. Update the parentId of the moving directory
    const now = new Date().toISOString();
    await db.execute(
      "UPDATE directories SET parentId = $1, updatedAt = $2 WHERE id = $3",
      [newParentId, now, id],
    );
  } catch (error) {
    console.error("Move failed", error);
    throw error;
  }
}

/**
 * Deletes directories that have no notes in their subtree.
 */
export async function cleanupEmptyDirectoriesFromDb(): Promise<CleanupResult> {
  const directoryIds = await getEmptyDirectoryIds();

  if (directoryIds.length === 0) {
    return { success: true, deletedIds: [] };
  }

  for (const directoryId of directoryIds) {
    await db.execute("DELETE FROM directories WHERE id = $1", [directoryId]);
  }

  return {
    success: true,
    deletedIds: directoryIds,
  };
}
