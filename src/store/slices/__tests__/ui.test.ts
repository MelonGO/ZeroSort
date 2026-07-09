/**
 * Tests for UI slice tab ordering and note close behavior.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../helpers", () => ({
  getDirPath: vi.fn(() => []),
  getExpandedPathsForCatalog: vi.fn(() => []),
  persistExpandedPaths: vi.fn(),
  persistTabs: vi.fn(),
}));

import { persistTabs } from "../../helpers";
import { createUiSlice } from "../ui";

function createStoreState() {
  let state: any;
  const set = (partial: any) => {
    const update = typeof partial === "function" ? partial(state) : partial;
    state = {
      ...state,
      ...update,
    };
  };

  const get = () => state;
  const slice = createUiSlice(set, get);

  state = {
    notesById: new Map(),
    directories: [],
    markNoteContentAccessed: vi.fn(),
    unloadNoteContent: vi.fn(),
    ...slice,
  };

  state.openNoteIds = ["note-1", "note-2", "note-3", "note-4"];
  state.selectedNoteId = "note-2";

  return {
    getState: () => state,
  };
}

describe("UI Slice - Reorder Open Notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should move a tab earlier in the open note order", () => {
    const { getState } = createStoreState();

    getState().reorderOpenNotes(2, 0);

    expect(getState().openNoteIds).toEqual([
      "note-3",
      "note-1",
      "note-2",
      "note-4",
    ]);
    expect(getState().selectedNoteId).toBe("note-2");
    expect(persistTabs).toHaveBeenCalledTimes(1);
  });

  it("Should move a tab later in the open note order", () => {
    const { getState } = createStoreState();

    getState().reorderOpenNotes(0, 3);

    expect(getState().openNoteIds).toEqual([
      "note-2",
      "note-3",
      "note-4",
      "note-1",
    ]);
    expect(persistTabs).toHaveBeenCalledTimes(1);
  });

  it("Should no-op when the destination index matches the source index", () => {
    const { getState } = createStoreState();

    getState().reorderOpenNotes(1, 1);

    expect(getState().openNoteIds).toEqual([
      "note-1",
      "note-2",
      "note-3",
      "note-4",
    ]);
    expect(persistTabs).not.toHaveBeenCalled();
  });

  it("Should no-op for out-of-range indices", () => {
    const { getState } = createStoreState();

    getState().reorderOpenNotes(-1, 2);
    getState().reorderOpenNotes(1, 5);

    expect(getState().openNoteIds).toEqual([
      "note-1",
      "note-2",
      "note-3",
      "note-4",
    ]);
    expect(persistTabs).not.toHaveBeenCalled();
  });
});

describe("UI Slice - Close Note", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should remember the last selected note when closing the final active tab", () => {
    const { getState } = createStoreState();

    getState().openNoteIds = ["note-2"];
    getState().selectedNoteId = "note-2";
    getState().lastSelectedNoteId = null;

    getState().closeNote("note-2");

    expect(getState().openNoteIds).toEqual([]);
    expect(getState().selectedNoteId).toBeNull();
    expect(getState().lastSelectedNoteId).toBe("note-2");
    expect(getState().unloadNoteContent).toHaveBeenCalledWith("note-2");
    expect(persistTabs).toHaveBeenCalledTimes(1);
  });

  it("Should clear the last selected note when switching to another open tab after close", () => {
    const { getState } = createStoreState();

    getState().lastSelectedNoteId = "stale-note";

    getState().closeNote("note-2");

    expect(getState().openNoteIds).toEqual(["note-1", "note-3", "note-4"]);
    expect(getState().selectedNoteId).toBe("note-1");
    expect(getState().lastSelectedNoteId).toBeNull();
    expect(getState().unloadNoteContent).toHaveBeenCalledWith("note-2");
    expect(persistTabs).toHaveBeenCalledTimes(1);
  });
});
