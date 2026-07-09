/**
 * Tests for directory deletion note reassignment behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Directories - Delete Without Notes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Should clear directoryId and bump updatedAt for kept notes", async () => {
    const directories = [
      { id: "parent-dir", name: "Parent", parentId: null, updatedAt: null },
      {
        id: "child-dir",
        name: "Child",
        parentId: "parent-dir",
        updatedAt: null,
      },
    ];
    const notes: Array<{
      id: string;
      directoryId: string | null;
      updatedAt: string;
    }> = [
      {
        id: "note-1",
        directoryId: "parent-dir",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "note-2",
        directoryId: "child-dir",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "note-3",
        directoryId: "other-dir",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const db = {
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("SELECT * FROM directories WHERE id = $1")) {
          return directories.filter(
            (directory) => directory.id === params?.[0],
          );
        }

        if (query.includes("SELECT * FROM directories")) {
          return directories;
        }

        return [];
      }),
      execute: vi.fn(async (query: string, params?: unknown[]) => {
        if (
          query.includes("UPDATE notes SET directoryId = NULL, updatedAt =")
        ) {
          const updateParams = params as string[];
          const targetIds = updateParams.slice(0, -1);
          const updatedAt = updateParams.at(-1)!;

          for (const note of notes) {
            if (note.directoryId && targetIds.includes(note.directoryId)) {
              note.directoryId = null;
              note.updatedAt = updatedAt;
            }
          }
          return;
        }

        if (query === "DELETE FROM directories WHERE id = $1") {
          const directoryId = params?.[0];
          const index = directories.findIndex(
            (directory) => directory.id === directoryId,
          );
          if (index >= 0) {
            directories.splice(index, 1);
          }
        }
      }),
    };

    vi.doMock("../index", () => ({ db }));
    vi.doMock("@/lib/images", () => ({
      deleteManagedImageFile: vi.fn(),
      extractManagedImagePathsFromContent: vi.fn(() => []),
    }));
    vi.doMock("i18next", () => ({ t: (key: string) => key }));

    const { deleteDirectoryFromDb } = await import("../directories");

    await deleteDirectoryFromDb("parent-dir", false);

    expect(notes[0]).toMatchObject({
      directoryId: null,
      updatedAt: "2024-01-02T03:04:05.000Z",
    });
    expect(notes[1]).toMatchObject({
      directoryId: null,
      updatedAt: "2024-01-02T03:04:05.000Z",
    });
    expect(notes[2]).toMatchObject({
      directoryId: "other-dir",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(directories).toHaveLength(0);
  });
});

describe("Directories - Rename Collisions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Should reject duplicate rename without mutating notes or directories", async () => {
    const directories = [
      { id: "source-dir", name: "Source", parentId: null, updatedAt: null },
      {
        id: "target-dir",
        name: "Target",
        parentId: null,
        updatedAt: null,
      },
    ];
    const notes = [
      {
        id: "note-1",
        directoryId: "source-dir",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const db = {
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("SELECT * FROM directories WHERE id = $1")) {
          return directories.filter(
            (directory) => directory.id === params?.[0],
          );
        }

        if (
          query.includes(
            "SELECT * FROM directories WHERE name = $1 AND parentId IS NULL",
          )
        ) {
          return directories.filter(
            (directory) => directory.name === params?.[0],
          );
        }

        return [];
      }),
      execute: vi.fn(async () => {}),
    };

    vi.doMock("../index", () => ({ db }));
    vi.doMock("@/lib/images", () => ({
      deleteManagedImageFile: vi.fn(),
      extractManagedImagePathsFromContent: vi.fn(() => []),
    }));
    vi.doMock("i18next", () => ({ t: (key: string) => key }));

    const { renameDirectory } = await import("../directories");

    await expect(renameDirectory("source-dir", "Target")).rejects.toThrow(
      "folder.alreadyExists",
    );

    expect(notes).toEqual([
      {
        id: "note-1",
        directoryId: "source-dir",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ]);
    expect(directories).toEqual([
      { id: "source-dir", name: "Source", parentId: null, updatedAt: null },
      { id: "target-dir", name: "Target", parentId: null, updatedAt: null },
    ]);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("Directories - Cleanup Empty", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("Should delete empty directories in leaf-first order", async () => {
    const directories = [
      { id: "root-empty", name: "Root Empty", parentId: null, updatedAt: null },
      {
        id: "child-empty",
        name: "Child Empty",
        parentId: "root-empty",
        updatedAt: null,
      },
      { id: "root-used", name: "Root Used", parentId: null, updatedAt: null },
      {
        id: "child-used",
        name: "Child Used",
        parentId: "root-used",
        updatedAt: null,
      },
    ];
    const deletedIds: string[] = [];

    const db = {
      select: vi.fn(async (query: string) => {
        if (query === "SELECT * FROM directories") {
          return directories;
        }

        if (
          query ===
          "SELECT DISTINCT directoryId FROM notes WHERE directoryId IS NOT NULL"
        ) {
          return [{ directoryId: "child-used" }];
        }

        return [];
      }),
      execute: vi.fn(async (query: string, params?: unknown[]) => {
        if (query === "DELETE FROM directories WHERE id = $1") {
          deletedIds.push(params?.[0] as string);
        }
      }),
    };

    vi.doMock("../index", () => ({ db }));
    vi.doMock("@/lib/images", () => ({
      deleteManagedImageFile: vi.fn(),
      extractManagedImagePathsFromContent: vi.fn(() => []),
    }));
    vi.doMock("i18next", () => ({ t: (key: string) => key }));

    const { cleanupEmptyDirectoriesFromDb } = await import("../directories");

    const result = await cleanupEmptyDirectoriesFromDb();

    expect(result).toEqual({
      success: true,
      deletedIds: ["child-empty", "root-empty"],
    });
    expect(deletedIds).toEqual(["child-empty", "root-empty"]);
  });

  it("Should preview empty directories with their full path labels", async () => {
    const directories = [
      { id: "root-empty", name: "Root Empty", parentId: null, updatedAt: null },
      {
        id: "child-empty",
        name: "Child Empty",
        parentId: "root-empty",
        updatedAt: null,
      },
      { id: "root-used", name: "Root Used", parentId: null, updatedAt: null },
      {
        id: "child-used",
        name: "Child Used",
        parentId: "root-used",
        updatedAt: null,
      },
    ];

    const db = {
      select: vi.fn(async (query: string) => {
        if (query === "SELECT * FROM directories") {
          return directories;
        }

        if (
          query ===
          "SELECT DISTINCT directoryId FROM notes WHERE directoryId IS NOT NULL"
        ) {
          return [{ directoryId: "child-used" }];
        }

        return [];
      }),
      execute: vi.fn(async () => {}),
    };

    vi.doMock("../index", () => ({ db }));
    vi.doMock("@/lib/images", () => ({
      deleteManagedImageFile: vi.fn(),
      extractManagedImagePathsFromContent: vi.fn(() => []),
    }));
    vi.doMock("i18next", () => ({ t: (key: string) => key }));

    const { previewEmptyDirectoriesFromDb } = await import("../directories");

    await expect(previewEmptyDirectoriesFromDb()).resolves.toEqual({
      items: [
        { id: "child-empty", label: "Root Empty / Child Empty" },
        { id: "root-empty", label: "Root Empty" },
      ],
    });
  });

  it("Should keep directories whose subtree contains notes", async () => {
    const directories = [
      { id: "root", name: "Root", parentId: null, updatedAt: null },
      { id: "child", name: "Child", parentId: "root", updatedAt: null },
    ];

    const db = {
      select: vi.fn(async (query: string) => {
        if (query === "SELECT * FROM directories") {
          return directories;
        }

        if (
          query ===
          "SELECT DISTINCT directoryId FROM notes WHERE directoryId IS NOT NULL"
        ) {
          return [{ directoryId: "child" }];
        }

        return [];
      }),
      execute: vi.fn(async () => {}),
    };

    vi.doMock("../index", () => ({ db }));
    vi.doMock("@/lib/images", () => ({
      deleteManagedImageFile: vi.fn(),
      extractManagedImagePathsFromContent: vi.fn(() => []),
    }));
    vi.doMock("i18next", () => ({ t: (key: string) => key }));

    const { cleanupEmptyDirectoriesFromDb } = await import("../directories");

    await expect(cleanupEmptyDirectoriesFromDb()).resolves.toEqual({
      success: true,
      deletedIds: [],
    });
    expect(db.execute).not.toHaveBeenCalled();
  });
});
