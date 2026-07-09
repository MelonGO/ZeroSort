import i18n from "@/i18n";
import { loadStore } from "@/lib/persistence";
import { Directory, FolderNode, ZeroSortState } from "@/types";

/**
 * Cached directory lookup helper reused by hot UI paths.
 */
export interface DirectoryPathResolver {
  /** Resolves the full nested path for a directory ID. */
  getPath: (dirId: string) => string[];
  /** Resolves the full nested label for a directory ID. */
  getPathLabel: (dirId: string, separator?: string) => string;
}

const directoryPathResolverCache = new WeakMap<
  Directory[],
  DirectoryPathResolver
>();

function createDirectoryPathResolver(
  allDirs: Directory[],
): DirectoryPathResolver {
  const dirMap = new Map(allDirs.map((dir) => [dir.id, dir]));
  const pathCache = new Map<string, string[]>();
  const labelCache = new Map<string, string>();

  const getPath = (dirId: string): string[] => {
    const cachedPath = pathCache.get(dirId);
    if (cachedPath) {
      return cachedPath;
    }

    const path: string[] = [];
    let currentId: string | null | undefined = dirId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const dir = dirMap.get(currentId);
      if (!dir) break;
      path.unshift(dir.name);
      currentId = dir.parentId;
    }

    pathCache.set(dirId, path);
    return path;
  };

  const getPathLabel = (dirId: string, separator = " / "): string => {
    const cacheKey = `${dirId}::${separator}`;
    const cachedLabel = labelCache.get(cacheKey);
    if (cachedLabel !== undefined) {
      return cachedLabel;
    }

    const label = getPath(dirId).join(separator);
    labelCache.set(cacheKey, label);
    return label;
  };

  return { getPath, getPathLabel };
}

/**
 * Returns a cached directory path resolver for the provided directory list.
 */
export function getDirectoryPathResolver(
  allDirs: Directory[],
): DirectoryPathResolver {
  const cachedResolver = directoryPathResolverCache.get(allDirs);
  if (cachedResolver) {
    return cachedResolver;
  }

  const resolver = createDirectoryPathResolver(allDirs);
  directoryPathResolverCache.set(allDirs, resolver);
  return resolver;
}

/**
 * Retrieves the full path names for a directory using an iterative approach for efficiency.
 *
 * @param dirId - The unique identifier of the directory.
 * @param allDirs - The list of all available directories to search within.
 * @returns An array of strings representing the names of the directory and its ancestors.
 */
export const getDirPath = (dirId: string, allDirs: Directory[]): string[] => {
  return getDirectoryPathResolver(allDirs).getPath(dirId);
};

/**
 * Retrieves the joined directory path label for a directory ID.
 */
export const getDirPathLabel = (
  dirId: string,
  allDirs: Directory[],
  separator = " / ",
): string => {
  return getDirectoryPathResolver(allDirs).getPathLabel(dirId, separator);
};

/**
 * Determines if a given child path is contained within a parent path.
 *
 * @param parent - The suspected parent path array.
 * @param child - The suspected child path array.
 * @returns True if the child path starts with the parent path.
 */
export const isSubPath = (parent: string[], child: string[]): boolean => {
  if (parent.length > child.length) return false;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== child[i]) return false;
  }
  return true;
};

/**
 * Generates all prefix paths for a given catalog to ensure they are expanded in the UI.
 *
 * @param catalog - The catalog path array.
 * @returns An array of string paths (e.g., ["root", "folder1", "folder1/folder2"]).
 */
export const getExpandedPathsForCatalog = (catalog: string[]): string[] => {
  const paths: string[] = ["root"];
  for (let i = 1; i <= catalog.length; i++) {
    paths.push(catalog.slice(0, i).join("/"));
  }
  return paths;
};

/**
 * Constructs a hierarchical folder tree from flat lists of notes and directories.
 * Optimized with a Map and path caching for performance with large numbers of directories.
 *
 * @param notes - The list of notes to include in the tree.
 * @param directories - The list of directories to define the tree structure.
 * @returns The root node of the constructed folder tree.
 */
export const buildTree = (
  notes: { id: string; directoryId: string | null }[],
  directories: Directory[],
): FolderNode => {
  const root: FolderNode = { name: "root", children: {}, noteIds: [] };
  const resolver = getDirectoryPathResolver(directories);

  // 1. Build tree structure from directories
  directories.forEach((dir) => {
    const path = resolver.getPath(dir.id);
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
      if (index === path.length - 1) {
        current.id = dir.id;
      }
    });
  });

  // 2. Add notes to their respective directories
  notes.forEach((note) => {
    let folders: string[] = [];
    if (note.directoryId) {
      folders = resolver.getPath(note.directoryId);
      if (folders.length === 0) {
        folders = [i18n.t("common.uncategorized")];
      }
    } else {
      folders = [i18n.t("common.uncategorized")];
    }

    let current = root;
    folders.forEach((folderName) => {
      if (!current.children[folderName]) {
        current.children[folderName] = {
          name: folderName,
          children: {},
          noteIds: [],
        };
      }
      current = current.children[folderName];
    });
    current.noteIds.push(note.id);
  });

  return root;
};

/**
 * Returns only the deepest directory paths, filtering out ancestors
 * that are already represented by deeper descendants.
 * This keeps the prompt compact by removing redundant intermediate paths.
 *
 * @param directories - The flat list of all directories.
 * @returns An array of string arrays, each representing a leaf directory path.
 */
export function getDeepestDirectoryPaths(directories: Directory[]): string[][] {
  if (directories.length === 0) return [];
  const resolver = getDirectoryPathResolver(directories);

  // Build all full paths
  const allPaths = directories.map((dir) => resolver.getPath(dir.id));

  // Sort by depth descending so deeper paths come first
  const sorted = [...allPaths].sort((a, b) => b.length - a.length);

  // Keep a path only if no already-kept path starts with it as a prefix
  const kept: string[][] = [];
  for (const path of sorted) {
    const isAncestor = kept.some(
      (keptPath) => keptPath.length > path.length && isSubPath(path, keptPath),
    );
    if (!isAncestor) {
      kept.push(path);
    }
  }

  return kept;
}

/**
 * Formats directory paths into a human-readable string for AI prompts.
 * Each path is rendered as "Segment1 > Segment2 > Segment3", one per line.
 *
 * @param paths - Array of directory path arrays from getDeepestDirectoryPaths.
 * @returns A newline-separated string of formatted paths.
 */
export function formatDirectoryPathsForPrompt(paths: string[][]): string {
  return paths.map((p) => p.join(" > ")).join("\n");
}

/**
 * Persists the current open tab IDs and selected note ID to the persistent store.
 * Fire-and-forget; errors are logged but do not block the UI.
 */
export const persistTabs = (get: () => ZeroSortState) => {
  const { openNoteIds, selectedNoteId } = get();
  loadStore()
    .then(async (store) => {
      await store.set("openNoteIds", openNoteIds);
      await store.set("selectedNoteId", selectedNoteId);
      await store.save();
    })
    .catch((e) => console.error("Failed to persist tabs:", e));
};

/**
 * Persists the current expanded sidebar folder paths to the persistent store.
 * Fire-and-forget; errors are logged but do not block the UI.
 */
export const persistExpandedPaths = (get: () => ZeroSortState) => {
  const expandedPaths = Array.from(get().expandedPaths);
  loadStore()
    .then(async (store) => {
      await store.set("expandedPaths", expandedPaths);
      await store.save();
    })
    .catch((e) => console.error("Failed to persist expanded paths:", e));
};
