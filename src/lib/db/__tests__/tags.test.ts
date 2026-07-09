/**
 * Tests for tag rename merge behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Tags - Rename Merge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Should merge tag relationships and bump updatedAt for affected notes", async () => {
    const tags = [
      {
        id: "tag-1",
        name: "Alpha",
        color: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      {
        id: "tag-2",
        name: "Beta",
        color: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
    ];
    const noteTags = [
      { noteId: "note-1", tagId: "tag-1" },
      { noteId: "note-1", tagId: "tag-2" },
      { noteId: "note-2", tagId: "tag-1" },
      { noteId: "note-3", tagId: "tag-2" },
    ];
    const notes = [
      { id: "note-1", updatedAt: "2026-03-20T10:00:00.000Z" },
      { id: "note-2", updatedAt: "2026-03-20T10:00:00.000Z" },
      { id: "note-3", updatedAt: "2026-03-20T10:00:00.000Z" },
    ];

    const db = {
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (
          query.includes(
            "SELECT id, name, color, createdAt, updatedAt FROM tags WHERE name = $1",
          )
        ) {
          return tags.filter((tag) => tag.name === params?.[0]);
        }

        if (
          query.includes(
            "SELECT DISTINCT noteId FROM note_tags WHERE tagId = $1",
          )
        ) {
          return noteTags
            .filter((entry) => entry.tagId === params?.[0])
            .map((entry) => ({ noteId: entry.noteId }));
        }

        return [];
      }),
      execute: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("INSERT OR IGNORE INTO note_tags")) {
          const [targetTagId, sourceTagId] = params as [string, string];
          const sourceEntries = noteTags.filter(
            (entry) => entry.tagId === sourceTagId,
          );

          for (const entry of sourceEntries) {
            const exists = noteTags.some(
              (candidate) =>
                candidate.noteId === entry.noteId &&
                candidate.tagId === targetTagId,
            );
            if (!exists) {
              noteTags.push({ noteId: entry.noteId, tagId: targetTagId });
            }
          }
          return;
        }

        if (query.includes("UPDATE notes SET updatedAt = $1 WHERE id IN (")) {
          const [updatedAt, ...noteIds] = params as string[];
          for (const note of notes) {
            if (noteIds.includes(note.id)) {
              note.updatedAt = updatedAt;
            }
          }
          return;
        }

        if (query === "DELETE FROM tags WHERE id = $1") {
          const tagId = params?.[0];
          const tagIndex = tags.findIndex((tag) => tag.id === tagId);
          if (tagIndex >= 0) {
            tags.splice(tagIndex, 1);
          }

          for (let index = noteTags.length - 1; index >= 0; index -= 1) {
            if (noteTags[index].tagId === tagId) {
              noteTags.splice(index, 1);
            }
          }
        }
      }),
    };

    vi.doMock("../index", () => ({ db }));

    const { renameTag } = await import("../tags");

    const result = await renameTag("tag-1", "Beta");

    expect(result).toEqual({
      merged: true,
      sourceTagId: "tag-1",
      targetTagId: "tag-2",
      affectedNoteIds: ["note-1", "note-2"],
      noteUpdatedAt: "2026-03-25T12:00:00.000Z",
    });
    expect(tags.map((tag) => tag.id)).toEqual(["tag-2"]);
    expect(noteTags).toEqual(
      expect.arrayContaining([
        { noteId: "note-1", tagId: "tag-2" },
        { noteId: "note-2", tagId: "tag-2" },
        { noteId: "note-3", tagId: "tag-2" },
      ]),
    );
    expect(noteTags).toHaveLength(3);
    expect(notes).toEqual([
      { id: "note-1", updatedAt: "2026-03-25T12:00:00.000Z" },
      { id: "note-2", updatedAt: "2026-03-25T12:00:00.000Z" },
      { id: "note-3", updatedAt: "2026-03-20T10:00:00.000Z" },
    ]);
  });

  it("Should delete only tags that are not assigned to notes", async () => {
    const deletedTagIds: string[][] = [];

    const db = {
      select: vi.fn(async (query: string) => {
        if (
          query.includes("FROM tags") &&
          query.includes("LEFT JOIN note_tags")
        ) {
          return [{ id: "tag-unused-1" }, { id: "tag-unused-2" }];
        }

        if (
          query.includes(
            "SELECT DISTINCT noteId FROM note_tags WHERE tagId IN (",
          )
        ) {
          return [];
        }

        return [];
      }),
      execute: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("DELETE FROM tags WHERE id IN (")) {
          deletedTagIds.push([...(params as string[])]);
        }
      }),
    };

    vi.doMock("../index", () => ({ db }));

    const { cleanupUnusedTagsFromDb } = await import("../tags");

    const result = await cleanupUnusedTagsFromDb();

    expect(result).toEqual({
      success: true,
      deletedIds: ["tag-unused-1", "tag-unused-2"],
    });
    expect(deletedTagIds).toEqual([["tag-unused-1", "tag-unused-2"]]);
  });

  it("Should preview unused tags by name", async () => {
    const db = {
      select: vi.fn(async (query: string) => {
        if (query.includes("SELECT tags.id, tags.name")) {
          return [
            { id: "tag-1", name: "Alpha" },
            { id: "tag-2", name: "Beta" },
          ];
        }

        return [];
      }),
      execute: vi.fn(async () => {}),
    };

    vi.doMock("../index", () => ({ db }));

    const { previewUnusedTagsFromDb } = await import("../tags");

    await expect(previewUnusedTagsFromDb()).resolves.toEqual({
      items: [
        { id: "tag-1", label: "Alpha" },
        { id: "tag-2", label: "Beta" },
      ],
    });
  });

  it("Should return an empty result when no unused tags exist", async () => {
    const db = {
      select: vi.fn(async (query: string) => {
        if (
          query.includes("FROM tags") &&
          query.includes("LEFT JOIN note_tags")
        ) {
          return [];
        }

        return [];
      }),
      execute: vi.fn(async () => {}),
    };

    vi.doMock("../index", () => ({ db }));

    const { cleanupUnusedTagsFromDb } = await import("../tags");

    await expect(cleanupUnusedTagsFromDb()).resolves.toEqual({
      success: true,
      deletedIds: [],
    });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("Should compute affected notes in the DB layer when deleting multiple tags", async () => {
    const noteTags = [
      { noteId: "note-1", tagId: "tag-1" },
      { noteId: "note-1", tagId: "tag-2" },
      { noteId: "note-2", tagId: "tag-2" },
      { noteId: "note-3", tagId: "tag-3" },
    ];
    const notes = [
      { id: "note-1", updatedAt: "2026-03-20T10:00:00.000Z" },
      { id: "note-2", updatedAt: "2026-03-20T10:00:00.000Z" },
      { id: "note-3", updatedAt: "2026-03-20T10:00:00.000Z" },
    ];
    const deletedTagIds: string[][] = [];

    const db = {
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (
          query.includes(
            "SELECT DISTINCT noteId FROM note_tags WHERE tagId IN (",
          )
        ) {
          const tagIds = new Set((params ?? []) as string[]);
          return noteTags
            .filter((entry) => tagIds.has(entry.tagId))
            .map((entry) => ({ noteId: entry.noteId }));
        }

        return [];
      }),
      execute: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("UPDATE notes SET updatedAt = $1 WHERE id IN (")) {
          const [updatedAt, ...noteIds] = params as string[];
          notes.forEach((note) => {
            if (noteIds.includes(note.id)) {
              note.updatedAt = updatedAt;
            }
          });
          return;
        }

        if (query.includes("DELETE FROM tags WHERE id IN (")) {
          deletedTagIds.push([...(params as string[])]);
        }
      }),
    };

    vi.doMock("../index", () => ({ db }));

    const { deleteTagsFromDb } = await import("../tags");

    const result = await deleteTagsFromDb(["tag-1", "tag-2"]);

    expect(result).toEqual({
      success: true,
      deletedTagIds: ["tag-1", "tag-2"],
      affectedNoteIds: ["note-1", "note-2"],
      noteUpdatedAt: "2026-03-25T12:00:00.000Z",
    });
    expect(deletedTagIds).toEqual([["tag-1", "tag-2"]]);
    expect(notes).toEqual([
      { id: "note-1", updatedAt: "2026-03-25T12:00:00.000Z" },
      { id: "note-2", updatedAt: "2026-03-25T12:00:00.000Z" },
      { id: "note-3", updatedAt: "2026-03-20T10:00:00.000Z" },
    ]);
  });
});
