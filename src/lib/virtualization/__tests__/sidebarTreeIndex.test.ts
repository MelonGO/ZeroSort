/**
 * Tests the lazy sidebar tree index used by the virtualized folder sidebar.
 */
import { createSidebarTreeIndex } from "@/lib/virtualization/sidebarTreeIndex";
import type { FolderNode, Note } from "@/types";
import { describe, expect, it } from "vitest";

function createNote(
  id: string,
  title: string,
  createdAt: string,
  summary = "",
  updatedAt?: string,
): Note {
  return {
    id,
    title,
    summary,
    content: "",
    directoryId: null,
    tagIds: [],
    createdAt,
    updatedAt,
  };
}

function createNotesMap(notes: Note[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

describe("createSidebarTreeIndex", () => {
  it("Should resolve visible items lazily without pre-flattening order changes", () => {
    const folderTree: FolderNode = {
      name: "root",
      children: {
        beta: {
          name: "beta",
          children: {},
          noteIds: ["note-2"],
        },
        alpha: {
          name: "alpha",
          children: {
            gamma: {
              name: "gamma",
              children: {},
              noteIds: ["note-3"],
            },
          },
          noteIds: ["note-1", "note-4"],
        },
      },
      noteIds: [],
    };

    const notesById = createNotesMap([
      createNote("note-1", "Older", "2024-01-01T00:00:00.000Z"),
      createNote("note-2", "Beta note", "2024-03-01T00:00:00.000Z"),
      createNote("note-3", "Nested", "2024-02-01T00:00:00.000Z"),
      createNote(
        "note-4",
        "Newest",
        "2024-01-10T00:00:00.000Z",
        "",
        "2024-04-01T00:00:00.000Z",
      ),
    ]);

    const index = createSidebarTreeIndex({
      folderTree,
      expandedPaths: new Set(["alpha", "alpha/gamma"]),
      notesById,
      sortBy: "updatedAt",
      searchQuery: "",
    });

    expect(index.count).toBe(7);
    expect(index.getItem(0)).toEqual({
      type: "header",
      node: folderTree,
    });
    expect(index.getItem(1)).toEqual({
      type: "folder",
      level: 0,
      path: "alpha",
      node: folderTree.children.alpha,
    });
    expect(index.getItem(2)).toEqual({
      type: "folder",
      level: 1,
      path: "alpha/gamma",
      node: folderTree.children.alpha.children.gamma,
    });
    expect(index.getItem(3)).toEqual({
      type: "note",
      level: 2,
      noteId: "note-3",
    });
    expect(index.getItem(4)).toEqual({
      type: "note",
      level: 1,
      noteId: "note-4",
    });
    expect(index.getItem(5)).toEqual({
      type: "note",
      level: 1,
      noteId: "note-1",
    });
    expect(index.getItem(6)).toEqual({
      type: "folder",
      level: 0,
      path: "beta",
      node: folderTree.children.beta,
    });
    expect(index.findNoteIndex("note-4")).toBe(4);
    expect(index.findNoteIndex("note-2")).toBe(-1);
  });

  it("Should keep folder-name search semantics while filtering unrelated branches", () => {
    const folderTree: FolderNode = {
      name: "root",
      children: {
        alpha: {
          name: "alpha",
          children: {
            gamma: {
              name: "gamma",
              children: {},
              noteIds: ["note-3"],
            },
          },
          noteIds: ["note-1", "note-2"],
        },
        beta: {
          name: "beta",
          children: {},
          noteIds: ["note-4"],
        },
      },
      noteIds: [],
    };

    const notesById = createNotesMap([
      createNote("note-1", "One", "2024-01-01T00:00:00.000Z"),
      createNote("note-2", "Two", "2024-01-02T00:00:00.000Z"),
      createNote("note-3", "Hidden child note", "2024-01-03T00:00:00.000Z"),
      createNote(
        "note-4",
        "Beta result",
        "2024-01-04T00:00:00.000Z",
        "contains alpha keyword",
      ),
    ]);

    const folderNameMatchIndex = createSidebarTreeIndex({
      folderTree,
      expandedPaths: new Set(),
      notesById,
      sortBy: "createdAt",
      searchQuery: "alpha",
    });

    expect(folderNameMatchIndex.count).toBe(6);
    expect(folderNameMatchIndex.getItem(1)).toEqual({
      type: "folder",
      level: 0,
      path: "alpha",
      node: folderTree.children.alpha,
    });
    expect(folderNameMatchIndex.getItem(2)).toEqual({
      type: "note",
      level: 1,
      noteId: "note-2",
    });
    expect(folderNameMatchIndex.getItem(3)).toEqual({
      type: "note",
      level: 1,
      noteId: "note-1",
    });
    expect(folderNameMatchIndex.getItem(4)).toEqual({
      type: "folder",
      level: 0,
      path: "beta",
      node: folderTree.children.beta,
    });
    expect(folderNameMatchIndex.getItem(5)).toEqual({
      type: "note",
      level: 1,
      noteId: "note-4",
    });

    const noteMatchIndex = createSidebarTreeIndex({
      folderTree,
      expandedPaths: new Set(),
      notesById,
      sortBy: "createdAt",
      searchQuery: "beta result",
    });

    expect(noteMatchIndex.count).toBe(3);
    expect(noteMatchIndex.getItem(1)).toEqual({
      type: "folder",
      level: 0,
      path: "beta",
      node: folderTree.children.beta,
    });
    expect(noteMatchIndex.getItem(2)).toEqual({
      type: "note",
      level: 1,
      noteId: "note-4",
    });
  });
});
