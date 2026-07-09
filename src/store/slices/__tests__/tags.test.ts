/**
 * Tests for tag slice deletion behavior, including batch removal.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({
  deleteTagsAction: vi.fn(),
  deleteTagAction: vi.fn(),
  getTagByNameAction: vi.fn(),
  saveTagAction: vi.fn(),
  updateTagAction: vi.fn(),
}));

import {
  deleteTagsAction,
  getTagByNameAction,
  saveTagAction,
  updateTagAction,
} from "@/lib/actions";
import { createTagsSlice } from "../tags";

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
  const slice = createTagsSlice(set, get);

  state = {
    notes: [
      {
        id: "note-1",
        tagIds: ["tag-1", "tag-2"],
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      {
        id: "note-2",
        tagIds: ["tag-2", "tag-3"],
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      {
        id: "note-3",
        tagIds: ["tag-4"],
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
    ],
    notesById: new Map(),
    selectedTagIds: new Set(["tag-2", "tag-4"]),
    ...slice,
  };

  state.notesById = new Map(state.notes.map((note: any) => [note.id, note]));

  state.tags = [
    { id: "tag-1", name: "Alpha", color: null, createdAt: "", updatedAt: "" },
    { id: "tag-2", name: "Beta", color: null, createdAt: "", updatedAt: "" },
    { id: "tag-3", name: "Gamma", color: null, createdAt: "", updatedAt: "" },
    { id: "tag-4", name: "Delta", color: null, createdAt: "", updatedAt: "" },
  ];

  return {
    getState: () => state,
  };
}

describe("Tags Slice - Batch Delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (deleteTagsAction as any).mockResolvedValue({
      success: true,
      deletedTagIds: [],
      affectedNoteIds: [],
    });
    (getTagByNameAction as any).mockResolvedValue(undefined);
    (saveTagAction as any).mockResolvedValue({ success: true, tag: null });
    (updateTagAction as any).mockResolvedValue({
      success: true,
      tag: null,
      merge: null,
    });
  });

  it("Should remove multiple tags from tags, notes, and active filters", async () => {
    const { getState } = createStoreState();

    (deleteTagsAction as any).mockResolvedValue({
      success: true,
      deletedTagIds: ["tag-2", "tag-4"],
      affectedNoteIds: ["note-1", "note-2", "note-3"],
      noteUpdatedAt: "2026-03-25T12:00:00.000Z",
    });

    await getState().deleteTags(["tag-2", "tag-4"]);

    expect(deleteTagsAction).toHaveBeenCalledTimes(1);
    expect(deleteTagsAction).toHaveBeenCalledWith(["tag-2", "tag-4"]);
    expect(getState().tags.map((tag: any) => tag.id)).toEqual([
      "tag-1",
      "tag-3",
    ]);
    expect(getState().notes.map((note: any) => note.tagIds)).toEqual([
      ["tag-1"],
      ["tag-3"],
      [],
    ]);
    expect(getState().notesById.get("note-1")?.tagIds).toEqual(["tag-1"]);
    expect(Array.from(getState().selectedTagIds)).toEqual([]);
    expect(getState().notes.every((note: any) => note.updatedAt)).toBe(true);
  });

  it("Should no-op when batch deletion is empty", async () => {
    const { getState } = createStoreState();

    await getState().deleteTags([]);

    expect(deleteTagsAction).not.toHaveBeenCalled();
    expect(getState().tags).toHaveLength(4);
    expect(Array.from(getState().selectedTagIds)).toEqual(["tag-2", "tag-4"]);
  });

  it("Should patch affected notes and filters when rename merges into an existing tag", async () => {
    const { getState } = createStoreState();
    getState().notes[1].tagIds = ["tag-1", "tag-3"];
    getState().selectedTagIds = new Set(["tag-1"]);

    (updateTagAction as any).mockResolvedValue({
      success: true,
      tag: {
        id: "tag-2",
        name: "Beta",
        color: null,
        createdAt: "",
        updatedAt: "2026-03-25T12:00:00.000Z",
      },
      merge: {
        merged: true,
        sourceTagId: "tag-1",
        targetTagId: "tag-2",
        affectedNoteIds: ["note-1", "note-2"],
        noteUpdatedAt: "2026-03-25T12:00:00.000Z",
      },
    });

    await getState().updateTag("tag-1", { name: "Beta" });

    expect(updateTagAction).toHaveBeenCalledWith({
      id: "tag-1",
      name: "Beta",
      color: undefined,
    });
    expect(getState().tags.map((tag: any) => tag.id)).toEqual([
      "tag-2",
      "tag-4",
      "tag-3",
    ]);
    expect(getState().notes.map((note: any) => note.tagIds)).toEqual([
      ["tag-2"],
      ["tag-2", "tag-3"],
      ["tag-4"],
    ]);
    expect(getState().notes[0].updatedAt).toBe("2026-03-25T12:00:00.000Z");
    expect(getState().notes[1].updatedAt).toBe("2026-03-25T12:00:00.000Z");
    expect(getState().notes[2].updatedAt).toBe("2026-03-20T10:00:00.000Z");
    expect(getState().notesById.get("note-2")?.tagIds).toEqual([
      "tag-2",
      "tag-3",
    ]);
    expect(Array.from(getState().selectedTagIds)).toEqual(["tag-2"]);
  });

  it("Should resolve duplicate create by fetching only the matching tag", async () => {
    const { getState } = createStoreState();
    const existingTag = {
      id: "tag-5",
      name: "Omega",
      color: null,
      createdAt: "",
      updatedAt: "",
    };

    (saveTagAction as any).mockRejectedValue(
      new Error("UNIQUE constraint failed: tags.name"),
    );
    (getTagByNameAction as any).mockResolvedValue(existingTag);

    const result = await getState().addTag("Omega");

    expect(saveTagAction).toHaveBeenCalledTimes(1);
    expect(getTagByNameAction).toHaveBeenCalledWith("Omega");
    expect(result).toEqual(existingTag);
    expect(getState().tags.map((tag: any) => tag.id)).toEqual([
      "tag-1",
      "tag-2",
      "tag-4",
      "tag-3",
      "tag-5",
    ]);
  });
});
