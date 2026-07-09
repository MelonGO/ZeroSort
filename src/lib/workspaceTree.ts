import i18n from "@/i18n";
import { Directory, FolderNode } from "@/types";

/**
 * Builds a pruned folder tree containing only the directories
 * relevant to the currently open notes (plus their ancestors for hierarchy).
 */
export function buildWorkspaceTree(
  openNoteIds: string[],
  notes: { id: string; directoryId: string | null }[],
  directories: Directory[],
): FolderNode {
  const root: FolderNode = { name: "root", children: {}, noteIds: [] };
  if (openNoteIds.length === 0) return root;

  const openSet = new Set(openNoteIds);
  const openNotes = notes.filter((n) => openSet.has(n.id));
  if (openNotes.length === 0) return root;

  const dirMap = new Map(directories.map((d) => [d.id, d]));
  const pathCache = new Map<string, string[]>();

  const getPath = (id: string): string[] => {
    if (pathCache.has(id)) return pathCache.get(id)!;
    const dir = dirMap.get(id);
    if (!dir) return [];
    const parentId = dir.parentId;
    const path =
      parentId && parentId !== id
        ? [...getPath(parentId), dir.name]
        : [dir.name];
    pathCache.set(id, path);
    return path;
  };

  // Collect relevant directory IDs (dirs of open notes + ancestors)
  const relevantDirIds = new Set<string>();
  for (const note of openNotes) {
    if (note.directoryId) {
      let currentId: string | null = note.directoryId;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        relevantDirIds.add(currentId);
        const dir = dirMap.get(currentId);
        currentId = dir?.parentId ?? null;
      }
    }
  }

  // Build only the relevant directory structure
  for (const dirId of relevantDirIds) {
    const path = getPath(dirId);
    const dir = dirMap.get(dirId);
    if (!dir || path.length === 0) continue;

    let current = root;
    path.forEach((folderName, index) => {
      if (!current.children[folderName]) {
        current.children[folderName] = {
          name: folderName,
          children: {},
          noteIds: [],
        };
      }
      current = current.children[folderName];
      // Attach directory ID at the leaf
      if (index === path.length - 1) {
        current.id = dir.id;
      }
    });
  }

  // Place open notes into their directories
  const uncategorizedLabel = i18n.t("common.uncategorized");
  for (const note of openNotes) {
    let folders: string[];
    if (note.directoryId) {
      folders = getPath(note.directoryId);
      if (folders.length === 0) {
        folders = [uncategorizedLabel];
      }
    } else {
      folders = [uncategorizedLabel];
    }

    let current = root;
    for (const folderName of folders) {
      if (!current.children[folderName]) {
        current.children[folderName] = {
          name: folderName,
          children: {},
          noteIds: [],
        };
      }
      current = current.children[folderName];
    }
    current.noteIds.push(note.id);
  }

  return root;
}
