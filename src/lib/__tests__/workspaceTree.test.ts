/**
 * Tests for the workspace tree builder that creates pruned folder trees
 * from currently open notes.
 */
import { buildWorkspaceTree } from "@/lib/workspaceTree";
import { Directory } from "@/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string) =>
      key === "common.uncategorized" ? "Uncategorized" : key,
  },
}));

const makeNote = (id: string, directoryId: string | null = null) => ({
  id,
  directoryId,
  title: `Note ${id}`,
  summary: "",
  content: "",
  tagIds: [],
  createdAt: "2026-01-01T00:00:00Z",
});

const makeDir = (
  id: string,
  name: string,
  parentId: string | null = null,
): Directory => ({
  id,
  name,
  parentId,
});

describe("buildWorkspaceTree", () => {
  it("Should return empty root when openNoteIds is empty", () => {
    const tree = buildWorkspaceTree([], [makeNote("n1")], []);
    expect(tree.name).toBe("root");
    expect(Object.keys(tree.children)).toHaveLength(0);
    expect(tree.noteIds).toHaveLength(0);
  });

  it("Should place uncategorized notes under Uncategorized folder", () => {
    const notes = [makeNote("n1"), makeNote("n2")];
    const tree = buildWorkspaceTree(["n1", "n2"], notes, []);

    expect(tree.children["Uncategorized"]).toBeDefined();
    expect(tree.children["Uncategorized"].noteIds).toEqual(["n1", "n2"]);
  });

  it("Should place a single note in its directory", () => {
    const dirs = [makeDir("d1", "Projects")];
    const notes = [makeNote("n1", "d1")];
    const tree = buildWorkspaceTree(["n1"], notes, dirs);

    expect(tree.children["Projects"]).toBeDefined();
    expect(tree.children["Projects"].noteIds).toEqual(["n1"]);
    expect(tree.children["Projects"].id).toBe("d1");
  });

  it("Should include ancestor directories for nested notes", () => {
    const dirs = [makeDir("d1", "Projects"), makeDir("d2", "Active", "d1")];
    const notes = [makeNote("n1", "d2")];
    const tree = buildWorkspaceTree(["n1"], notes, dirs);

    expect(tree.children["Projects"]).toBeDefined();
    expect(tree.children["Projects"].id).toBe("d1");
    expect(tree.children["Projects"].children["Active"]).toBeDefined();
    expect(tree.children["Projects"].children["Active"].id).toBe("d2");
    expect(tree.children["Projects"].children["Active"].noteIds).toEqual([
      "n1",
    ]);
  });

  it("Should only include open notes, not all notes", () => {
    const dirs = [makeDir("d1", "Work")];
    const notes = [
      makeNote("n1", "d1"),
      makeNote("n2", "d1"),
      makeNote("n3", "d1"),
    ];
    const tree = buildWorkspaceTree(["n1", "n3"], notes, dirs);

    expect(tree.children["Work"].noteIds).toEqual(["n1", "n3"]);
    expect(tree.children["Work"].noteIds).not.toContain("n2");
  });

  it("Should handle mixed categorized and uncategorized notes", () => {
    const dirs = [makeDir("d1", "Work")];
    const notes = [makeNote("n1", "d1"), makeNote("n2", null)];
    const tree = buildWorkspaceTree(["n1", "n2"], notes, dirs);

    expect(tree.children["Work"]).toBeDefined();
    expect(tree.children["Work"].noteIds).toEqual(["n1"]);
    expect(tree.children["Uncategorized"]).toBeDefined();
    expect(tree.children["Uncategorized"].noteIds).toEqual(["n2"]);
  });

  it("Should handle notes with missing directory references gracefully", () => {
    const notes = [makeNote("n1", "nonexistent-dir")];
    const tree = buildWorkspaceTree(["n1"], notes, []);

    // Falls back to Uncategorized when directory not found
    expect(tree.children["Uncategorized"]).toBeDefined();
    expect(tree.children["Uncategorized"].noteIds).toEqual(["n1"]);
  });

  it("Should not include directories without open notes", () => {
    const dirs = [makeDir("d1", "Work"), makeDir("d2", "Personal")];
    const notes = [makeNote("n1", "d1"), makeNote("n2", "d2")];
    // Only open n1 (in Work), Personal should not appear
    const tree = buildWorkspaceTree(["n1"], notes, dirs);

    expect(tree.children["Work"]).toBeDefined();
    expect(tree.children["Personal"]).toBeUndefined();
  });

  it("Should ignore openNoteIds that don't exist in notes array", () => {
    const tree = buildWorkspaceTree(["nonexistent"], [makeNote("n1")], []);
    expect(Object.keys(tree.children)).toHaveLength(0);
  });
});
