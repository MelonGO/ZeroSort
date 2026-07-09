import type { FolderNode, Note, SortBy } from "@/types";

/**
 * Represents a lazily resolved row in the sidebar tree virtualizer.
 */
export type SidebarTreeItem =
  | { type: "header"; node: FolderNode }
  | { type: "folder"; level: number; path: string; node: FolderNode }
  | { type: "note"; level: number; noteId: string };

/**
 * Compact index used to resolve sidebar rows for virtualization.
 * The active visible rows are flattened once per index and cached with the
 * filtered tree so random virtual row lookup stays O(1).
 */
export interface SidebarTreeIndex {
  /** Total number of visible rows, including the header row. */
  count: number;
  /** Returns the visible row at a given virtual index. */
  getItem: (index: number) => SidebarTreeItem | null;
  /** Returns the visible index for a note row, or -1 if it is not visible. */
  findNoteIndex: (noteId: string) => number;
}

interface SidebarTreeIndexOptions {
  folderTree: FolderNode;
  expandedPaths: Set<string>;
  notesById: Map<string, Note>;
  sortBy: SortBy;
  searchQuery: string;
}

interface IndexedFolderNode {
  children: IndexedFolderNode[];
  isOpen: boolean;
  level: number;
  node: FolderNode;
  noteIds: string[];
  path: string;
  visibleCount: number;
}

interface StableIndexedFolderNode {
  children: StableIndexedFolderNode[];
  level: number;
  node: FolderNode;
  normalizedName: string;
  noteSearchTextById: Map<string, string>;
  path: string;
  sortedNoteIds: string[];
}

const sidebarTreeCache = new WeakMap<
  FolderNode,
  WeakMap<Map<string, Note>, Map<SortBy, StableIndexedFolderNode[]>>
>();
const sidebarQueryResultCache = new WeakMap<
  StableIndexedFolderNode[],
  Map<
    string,
    {
      count: number;
      indexedChildren: IndexedFolderNode[];
      visibleRows: SidebarTreeItem[];
    }
  >
>();
const SIDEBAR_QUERY_CACHE_LIMIT = 20;

function compareNotesBySortField(
  noteIdA: string,
  noteIdB: string,
  notesById: Map<string, Note>,
  sortBy: SortBy,
) {
  const noteA = notesById.get(noteIdA);
  const noteB = notesById.get(noteIdB);

  if (!noteA || !noteB) {
    return 0;
  }

  const valueA =
    sortBy === "updatedAt"
      ? (noteA.updatedAt ?? noteA.createdAt)
      : noteA.createdAt;
  const valueB =
    sortBy === "updatedAt"
      ? (noteB.updatedAt ?? noteB.createdAt)
      : noteB.createdAt;

  if (valueA < valueB) {
    return 1;
  }

  if (valueA > valueB) {
    return -1;
  }

  return 0;
}

function getNoteSearchText(note: Note | undefined) {
  return note ? `${note.title}\n${note.summary}`.toLowerCase() : "";
}

function buildStableIndexedFolderNode(
  node: FolderNode,
  level: number,
  path: string,
  notesById: Map<string, Note>,
  sortBy: SortBy,
): StableIndexedFolderNode {
  const sortedChildren = Object.values(node.children)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((child) =>
      buildStableIndexedFolderNode(
        child,
        level + 1,
        `${path}/${child.name}`,
        notesById,
        sortBy,
      ),
    );

  const sortedNoteIds = [...node.noteIds].sort((noteIdA, noteIdB) =>
    compareNotesBySortField(noteIdA, noteIdB, notesById, sortBy),
  );

  return {
    children: sortedChildren,
    level,
    node,
    normalizedName: node.name.toLowerCase(),
    noteSearchTextById: new Map(
      sortedNoteIds.map((noteId) => [
        noteId,
        getNoteSearchText(notesById.get(noteId)),
      ]),
    ),
    path,
    sortedNoteIds,
  };
}

function getStableIndexedChildren(
  folderTree: FolderNode,
  notesById: Map<string, Note>,
  sortBy: SortBy,
): StableIndexedFolderNode[] {
  let notesCache = sidebarTreeCache.get(folderTree);
  if (!notesCache) {
    notesCache = new WeakMap();
    sidebarTreeCache.set(folderTree, notesCache);
  }

  let sortCache = notesCache.get(notesById);
  if (!sortCache) {
    sortCache = new Map();
    notesCache.set(notesById, sortCache);
  }

  const cachedChildren = sortCache.get(sortBy);
  if (cachedChildren) {
    return cachedChildren;
  }

  const stableChildren = Object.values(folderTree.children)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((child) =>
      buildStableIndexedFolderNode(child, 0, child.name, notesById, sortBy),
    );

  sortCache.set(sortBy, stableChildren);
  return stableChildren;
}

function filterIndexedFolderNode(
  stableNode: StableIndexedFolderNode,
  expandedPaths: Set<string>,
  query: string,
): IndexedFolderNode | null {
  const indexedChildren: IndexedFolderNode[] = [];
  let childVisibleCount = 0;

  for (const child of stableNode.children) {
    const indexedChild = filterIndexedFolderNode(child, expandedPaths, query);
    if (!indexedChild) {
      continue;
    }

    indexedChildren.push(indexedChild);
    childVisibleCount += indexedChild.visibleCount;
  }

  let visibleNoteIds = stableNode.sortedNoteIds;

  if (query) {
    const folderNameMatches = stableNode.normalizedName.includes(query);

    if (!folderNameMatches) {
      visibleNoteIds = stableNode.sortedNoteIds.filter((noteId) =>
        stableNode.noteSearchTextById.get(noteId)?.includes(query),
      );
    }

    const isVisible =
      folderNameMatches ||
      visibleNoteIds.length > 0 ||
      indexedChildren.length > 0;

    if (!isVisible) {
      return null;
    }
  }

  const isOpen = query.length > 0 || expandedPaths.has(stableNode.path);
  const visibleCount =
    1 + (isOpen ? childVisibleCount + visibleNoteIds.length : 0);

  return {
    children: indexedChildren,
    isOpen,
    level: stableNode.level,
    node: stableNode.node,
    noteIds: visibleNoteIds,
    path: stableNode.path,
    visibleCount,
  };
}

function appendVisibleRows(
  indexedNode: IndexedFolderNode,
  rows: SidebarTreeItem[],
) {
  rows.push({
    type: "folder",
    level: indexedNode.level,
    path: indexedNode.path,
    node: indexedNode.node,
  });

  if (!indexedNode.isOpen) {
    return;
  }

  for (const child of indexedNode.children) {
    appendVisibleRows(child, rows);
  }

  for (const noteId of indexedNode.noteIds) {
    rows.push({
      type: "note",
      level: indexedNode.level + 1,
      noteId,
    });
  }
}

/**
 * Builds a compact, lazily resolved index for the sidebar tree.
 */
export function createSidebarTreeIndex({
  folderTree,
  expandedPaths,
  notesById,
  sortBy,
  searchQuery,
}: SidebarTreeIndexOptions): SidebarTreeIndex {
  const query = searchQuery.toLowerCase().trim();
  const stableChildren = getStableIndexedChildren(
    folderTree,
    notesById,
    sortBy,
  );
  let indexedChildren: IndexedFolderNode[];
  let count: number;
  let visibleRows: SidebarTreeItem[];
  let noteIndexById: Map<string, number> | null = null;

  const cachedQueryResult =
    query.length > 0
      ? sidebarQueryResultCache.get(stableChildren)?.get(query)
      : null;

  if (cachedQueryResult) {
    indexedChildren = cachedQueryResult.indexedChildren;
    count = cachedQueryResult.count;
    visibleRows = cachedQueryResult.visibleRows;
  } else {
    indexedChildren = [];
    visibleRows = [{ type: "header", node: folderTree }];

    for (const child of stableChildren) {
      const indexedChild = filterIndexedFolderNode(child, expandedPaths, query);

      if (!indexedChild) {
        continue;
      }

      indexedChildren.push(indexedChild);
      appendVisibleRows(indexedChild, visibleRows);
    }

    count = visibleRows.length;

    if (query.length > 0) {
      let queryCache = sidebarQueryResultCache.get(stableChildren);
      if (!queryCache) {
        queryCache = new Map();
        sidebarQueryResultCache.set(stableChildren, queryCache);
      }

      queryCache.set(query, { count, indexedChildren, visibleRows });
      if (queryCache.size > SIDEBAR_QUERY_CACHE_LIMIT) {
        const oldestKey = queryCache.keys().next().value;
        if (oldestKey) {
          queryCache.delete(oldestKey);
        }
      }
    }
  }

  return {
    count,
    getItem: (index) => visibleRows[index] ?? null,
    findNoteIndex: (noteId) => {
      if (!noteIndexById) {
        noteIndexById = new Map();
        for (let i = 0; i < visibleRows.length; i++) {
          const row = visibleRows[i];
          if (row.type === "note") {
            noteIndexById.set(row.noteId, i);
          }
        }
      }

      return noteIndexById.get(noteId) ?? -1;
    },
  };
}
