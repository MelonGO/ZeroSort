/**
 * Tests for bounded note content caching and note content eviction behavior.
 */

import type { Note } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string) => key,
  },
}));

vi.mock("../../helpers", () => ({
  buildTree: vi.fn(() => ({ name: "root", children: {}, noteIds: [] })),
  getDirPath: vi.fn(() => []),
  getExpandedPathsForCatalog: vi.fn(() => []),
  persistExpandedPaths: vi.fn(),
  persistTabs: vi.fn(),
}));

vi.mock("@/lib/tiptap/editorContentCache", () => ({
  clearParsedEditorContent: vi.fn(),
  pruneParsedEditorContent: vi.fn(),
}));

vi.mock("@/lib/actions", () => ({
  cleanupEmptyDirectoriesAction: vi.fn(),
  deleteDirectoryAction: vi.fn(),
  getDirectoriesAction: vi.fn(),
  getNoteContentAction: vi.fn(),
  moveDirectoryAction: vi.fn(),
  saveDirectoryAction: vi.fn(),
  saveNoteAction: vi.fn(),
  setNoteTagIdsAction: vi.fn(),
  updateDirectoryAction: vi.fn(),
  updateNoteDirectoryAction: vi.fn(),
}));

import { getNoteContentAction, setNoteTagIdsAction } from "@/lib/actions";
import { clearParsedEditorContent } from "@/lib/tiptap/editorContentCache";
import { createNotesSlice, getNoteContentFromStore } from "../notes";
import { createUiSlice } from "../ui";

function createNote(id: string): Note {
  return {
    id,
    title: `Note ${id}`,
    summary: "",
    content: "",
    directoryId: null,
    tagIds: [],
    createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    isContentLoaded: false,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createStoreState(initialNotes: Note[]) {
  let state: any;
  const set = (partial: any) => {
    const update = typeof partial === "function" ? partial(state) : partial;
    state = {
      ...state,
      ...update,
    };
  };

  const get = () => state;
  const notesSlice = createNotesSlice(set, get);
  const uiSlice = createUiSlice(set, get);

  state = {
    tags: [],
    ...notesSlice,
    ...uiSlice,
  };

  state.setNotes(initialNotes);

  return {
    getState: () => state,
  };
}

async function openAndLoadNote(getState: () => any, id: string) {
  getState().setSelectedNoteId(id);
  await getState().loadNoteContent(id);
}

describe("Notes Slice - Bounded Note Content Cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should evict the least recently used loaded note when more than three notes are opened", async () => {
    const notes = Array.from({ length: 11 }, (_, i) =>
      createNote(`note-${i + 1}`),
    );
    const { getState } = createStoreState(notes);

    vi.mocked(getNoteContentAction).mockImplementation(async (id: string) => {
      return `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"${id}"}]}]}`;
    });

    // Load 10 notes (the cache limit)
    for (let i = 1; i <= 10; i++) {
      await openAndLoadNote(getState, `note-${i}`);
    }

    // Re-select note-1 to make it most recently used
    getState().setSelectedNoteId("note-1");

    // Loading the 11th note should evict the LRU note (note-2)
    await openAndLoadNote(getState, "note-11");

    expect(getState().notesById.get("note-1")?.isContentLoaded).toBe(true);
    expect(getState().notesById.get("note-2")?.isContentLoaded).toBe(false);
    expect(getNoteContentFromStore("note-2")).toBe("");
    expect(getState().loadedNoteRecency).toEqual([
      "note-3",
      "note-4",
      "note-5",
      "note-6",
      "note-7",
      "note-8",
      "note-9",
      "note-10",
      "note-1",
      "note-11",
    ]);
    expect(clearParsedEditorContent).toHaveBeenCalledWith("note-2");
  });

  it("Should keep three warm notes loaded during repeated switching", async () => {
    const { getState } = createStoreState([
      createNote("note-1"),
      createNote("note-2"),
      createNote("note-3"),
    ]);

    vi.mocked(getNoteContentAction).mockImplementation(async (id: string) => {
      return `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"${id}"}]}]}`;
    });

    await openAndLoadNote(getState, "note-1");
    await openAndLoadNote(getState, "note-2");
    await openAndLoadNote(getState, "note-3");

    getState().setSelectedNoteId("note-1");
    getState().setSelectedNoteId("note-2");
    getState().setSelectedNoteId("note-3");

    expect(getState().loadedNoteRecency).toEqual([
      "note-1",
      "note-2",
      "note-3",
    ]);
    expect(getState().notes.every((note: Note) => note.isContentLoaded)).toBe(
      true,
    );
    expect(getNoteContentAction).toHaveBeenCalledTimes(3);
  });

  it("Should unload a closed note and clear its recency and scroll state", async () => {
    const { getState } = createStoreState([
      createNote("note-1"),
      createNote("note-2"),
    ]);

    vi.mocked(getNoteContentAction).mockImplementation(async (id: string) => {
      return `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"${id}"}]}]}`;
    });

    await openAndLoadNote(getState, "note-1");
    await openAndLoadNote(getState, "note-2");
    getState().setNoteScrollPosition("note-1", 120);

    getState().closeNote("note-1");

    expect(getState().openNoteIds).toEqual(["note-2"]);
    expect(getState().notesById.get("note-1")?.isContentLoaded).toBe(false);
    expect(getNoteContentFromStore("note-1")).toBe("");
    expect(getState().loadedNoteRecency).toEqual(["note-2"]);
    expect(getState().noteScrollPositions).toEqual({});
    expect(clearParsedEditorContent).toHaveBeenCalledWith("note-1");
  });

  it("Should remove deleted notes from note content cache tracking", async () => {
    const { getState } = createStoreState([
      createNote("note-1"),
      createNote("note-2"),
    ]);

    vi.mocked(getNoteContentAction).mockImplementation(async (id: string) => {
      return `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"${id}"}]}]}`;
    });

    await openAndLoadNote(getState, "note-1");
    getState().setNoteScrollPosition("note-1", 45);

    getState().deleteNote("note-1");

    expect(getState().notesById.has("note-1")).toBe(false);
    expect(getState().loadedNoteRecency).toEqual([]);
    expect(getState().noteScrollPositions).toEqual({});
    expect(clearParsedEditorContent).toHaveBeenCalledWith("note-1");
  });

  it("Should ignore an in-flight load that finishes after the note was closed", async () => {
    const { getState } = createStoreState([createNote("note-1")]);
    const deferred = createDeferred<string | undefined>();

    vi.mocked(getNoteContentAction).mockReturnValue(deferred.promise);

    getState().setSelectedNoteId("note-1");
    const loadPromise = getState().loadNoteContent("note-1");

    getState().closeNote("note-1");
    deferred.resolve(
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"late"}]}]}',
    );

    await loadPromise;

    expect(getState().notesById.get("note-1")?.isContentLoaded).toBe(false);
    expect(getNoteContentFromStore("note-1")).toBe("");
    expect(getState().loadedNoteRecency).toEqual([]);
  });

  it("Should prune parsed content cache entries to currently loaded notes", async () => {
    const notes = Array.from({ length: 12 }, (_, i) =>
      createNote(`note-${i + 1}`),
    );
    const { getState } = createStoreState(notes);

    vi.mocked(getNoteContentAction).mockImplementation(async (id: string) => {
      return `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"${id}"}]}]}`;
    });

    // Load 10 notes (the cache limit)
    for (let i = 1; i <= 10; i++) {
      await openAndLoadNote(getState, `note-${i}`);
    }

    // Re-select note-2 so note-1 stays LRU
    getState().setSelectedNoteId("note-2");

    // Loading the 11th note triggers eviction of note-1 (LRU)
    await openAndLoadNote(getState, "note-11");

    expect(clearParsedEditorContent).toHaveBeenCalledWith("note-1");
  });
});

describe("Notes Slice - Note Tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should add a tag to one note without rebuilding unrelated note references", async () => {
    const firstNote = createNote("note-1");
    const secondNote = createNote("note-2");
    const { getState } = createStoreState([firstNote, secondNote]);

    await getState().addTagToNote("note-1", "tag-a");

    expect(setNoteTagIdsAction).toHaveBeenCalledWith(
      "note-1",
      ["tag-a"],
      expect.any(String),
    );
    expect(getState().notesById.get("note-1")?.tagIds).toEqual(["tag-a"]);
    expect(getState().notesById.get("note-2")).toBe(secondNote);
  });

  it("Should remove a tag from one note and preserve remaining tag order", async () => {
    const note = {
      ...createNote("note-1"),
      tagIds: ["tag-a", "tag-b", "tag-c"],
    };
    const { getState } = createStoreState([note]);

    await getState().removeTagFromNote("note-1", "tag-b");

    expect(setNoteTagIdsAction).toHaveBeenCalledWith(
      "note-1",
      ["tag-a", "tag-c"],
      expect.any(String),
    );
    expect(getState().notesById.get("note-1")?.tagIds).toEqual([
      "tag-a",
      "tag-c",
    ]);
  });

  it("Should replace all tags on one note", async () => {
    const note = {
      ...createNote("note-1"),
      tagIds: ["tag-a"],
    };
    const { getState } = createStoreState([note]);

    await getState().setNoteTagIds("note-1", ["tag-b", "tag-c"]);

    expect(setNoteTagIdsAction).toHaveBeenCalledWith(
      "note-1",
      ["tag-b", "tag-c"],
      expect.any(String),
    );
    expect(getState().notesById.get("note-1")?.tagIds).toEqual([
      "tag-b",
      "tag-c",
    ]);
  });
});
