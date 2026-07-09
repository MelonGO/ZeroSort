/**
 * Tests for store helper utilities that build folder paths and persist UI state.
 */
import {
  buildTree,
  formatDirectoryPathsForPrompt,
  getDeepestDirectoryPaths,
  getDirectoryPathResolver,
  getDirPath,
  getDirPathLabel,
  getExpandedPathsForCatalog,
  isSubPath,
  persistExpandedPaths,
  persistTabs,
} from "@/store/helpers";
import type { Directory, ZeroSortState } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadStore } = vi.hoisted(() => ({
  loadStore: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string) =>
      key === "common.uncategorized" ? "Uncategorized" : key,
  },
}));

vi.mock("@/lib/persistence", () => ({
  loadStore,
}));

function makeDir(
  id: string,
  name: string,
  parentId: string | null = null,
): Directory {
  return { id, name, parentId };
}

function makeState(overrides: Partial<ZeroSortState> = {}): ZeroSortState {
  return {
    notes: [],
    notesById: new Map(),
    directories: [],
    tags: [],
    folderTree: { name: "root", children: {}, noteIds: [] },
    isMultiSelectMode: false,
    selectedNoteIds: new Set(),
    selectedNoteId: null,
    lastSelectedNoteId: null,
    isSidebarOpen: true,
    expandedPaths: new Set(),
    expandedNoteIds: new Set(),
    hasUnsavedChanges: false,
    saveCurrentNote: null,
    pendingNoteId: null,
    pendingCloseNoteId: undefined,
    isInitialized: true,
    showSummary: true,
    includeExistingDirs: true,
    isRegeneratingTitle: false,
    isRegeneratingSummary: false,
    isRegeneratingDirectory: false,
    isRegeneratingTags: false,
    selectedTagIds: new Set(),
    tagFilterMode: "or",
    homeScrollPosition: 0,
    openNoteIds: [],
    ...overrides,
  } as ZeroSortState;
}

describe("store helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDirPath", () => {
    it("Should return the full nested path for a directory", () => {
      const directories = [
        makeDir("root", "Projects"),
        makeDir("child", "Active", "root"),
        makeDir("leaf", "ZeroSort", "child"),
      ];

      expect(getDirPath("leaf", directories)).toEqual([
        "Projects",
        "Active",
        "ZeroSort",
      ]);
    });

    it("Should stop safely when parent links form a cycle", () => {
      const directories = [
        makeDir("a", "Alpha", "b"),
        makeDir("b", "Beta", "a"),
      ];

      expect(getDirPath("a", directories)).toEqual(["Beta", "Alpha"]);
    });

    it("Should return an empty path for unknown directories", () => {
      expect(getDirPath("missing", [makeDir("a", "Alpha")])).toEqual([]);
    });

    it("Should reuse the cached resolver for the same directory array", () => {
      const directories = [makeDir("root", "Projects")];

      expect(getDirectoryPathResolver(directories)).toBe(
        getDirectoryPathResolver(directories),
      );
    });

    it("Should reuse cached path labels for repeated lookups", () => {
      const directories = [
        makeDir("root", "Projects"),
        makeDir("child", "Active", "root"),
      ];

      expect(getDirPathLabel("child", directories)).toBe("Projects / Active");
      expect(getDirPathLabel("child", directories)).toBe("Projects / Active");
    });
  });

  describe("isSubPath", () => {
    it("Should return true when the child shares the full parent prefix", () => {
      expect(
        isSubPath(["Projects", "Active"], ["Projects", "Active", "App"]),
      ).toBe(true);
    });

    it("Should return false when the child diverges from the parent path", () => {
      expect(isSubPath(["Projects", "Active"], ["Projects", "Archived"])).toBe(
        false,
      );
    });

    it("Should treat identical paths as subpaths", () => {
      expect(isSubPath(["Projects"], ["Projects"])).toBe(true);
    });
  });

  describe("getExpandedPathsForCatalog", () => {
    it("Should include the root path and every catalog prefix", () => {
      expect(getExpandedPathsForCatalog(["Projects", "Active", "App"])).toEqual(
        ["root", "Projects", "Projects/Active", "Projects/Active/App"],
      );
    });

    it("Should only include root for an empty catalog", () => {
      expect(getExpandedPathsForCatalog([])).toEqual(["root"]);
    });
  });

  describe("buildTree", () => {
    it("Should build nested folders and place notes in the expected nodes", () => {
      const tree = buildTree(
        [
          { id: "n1", directoryId: "feature" },
          { id: "n2", directoryId: null },
          { id: "n3", directoryId: "missing" },
        ],
        [
          makeDir("projects", "Projects"),
          makeDir("feature", "Feature", "projects"),
        ],
      );

      expect(tree.children.Projects.id).toBe("projects");
      expect(tree.children.Projects.children.Feature.id).toBe("feature");
      expect(tree.children.Projects.children.Feature.noteIds).toEqual(["n1"]);
      expect(tree.children.Uncategorized.noteIds).toEqual(["n2", "n3"]);
    });

    it("Should handle directories that point to themselves", () => {
      const tree = buildTree(
        [{ id: "n1", directoryId: "self" }],
        [makeDir("self", "Self", "self")],
      );

      expect(tree.children.Self.id).toBe("self");
      expect(tree.children.Self.noteIds).toEqual(["n1"]);
    });
  });

  describe("getDeepestDirectoryPaths", () => {
    it("Should keep only leaf directory paths when ancestors are also present", () => {
      const directories = [
        makeDir("projects", "Projects"),
        makeDir("active", "Active", "projects"),
        makeDir("app", "App", "active"),
        makeDir("archive", "Archive", "projects"),
      ];

      expect(getDeepestDirectoryPaths(directories)).toEqual([
        ["Projects", "Active", "App"],
        ["Projects", "Archive"],
      ]);
    });

    it("Should return an empty list when no directories exist", () => {
      expect(getDeepestDirectoryPaths([])).toEqual([]);
    });
  });

  describe("formatDirectoryPathsForPrompt", () => {
    it("Should join path segments with separators and line breaks", () => {
      expect(
        formatDirectoryPathsForPrompt([
          ["Projects", "Active", "App"],
          ["Projects", "Archive"],
        ]),
      ).toBe("Projects > Active > App\nProjects > Archive");
    });
  });

  describe("persistTabs", () => {
    it("Should persist open tabs and the selected note", async () => {
      const set = vi.fn().mockResolvedValue(undefined);
      const save = vi.fn().mockResolvedValue(undefined);
      loadStore.mockResolvedValue({ set, save });

      persistTabs(() =>
        makeState({
          openNoteIds: ["n1", "n2"],
          selectedNoteId: "n2",
        }),
      );

      await vi.waitFor(() => expect(save).toHaveBeenCalled());

      expect(set).toHaveBeenNthCalledWith(1, "openNoteIds", ["n1", "n2"]);
      expect(set).toHaveBeenNthCalledWith(2, "selectedNoteId", "n2");
    });

    it("Should log an error when persisting tabs fails", async () => {
      const error = new Error("disk full");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      loadStore.mockRejectedValue(error);

      persistTabs(() => makeState());

      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          "Failed to persist tabs:",
          error,
        ),
      );
    });
  });

  describe("persistExpandedPaths", () => {
    it("Should persist expanded paths as an array", async () => {
      const set = vi.fn().mockResolvedValue(undefined);
      const save = vi.fn().mockResolvedValue(undefined);
      loadStore.mockResolvedValue({ set, save });

      persistExpandedPaths(() =>
        makeState({
          expandedPaths: new Set(["root", "Projects/Active"]),
        }),
      );

      await vi.waitFor(() => expect(save).toHaveBeenCalled());

      expect(set).toHaveBeenCalledWith("expandedPaths", [
        "root",
        "Projects/Active",
      ]);
    });

    it("Should log an error when expanded path persistence fails", async () => {
      const error = new Error("store unavailable");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      loadStore.mockRejectedValue(error);

      persistExpandedPaths(() => makeState());

      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          "Failed to persist expanded paths:",
          error,
        ),
      );
    });
  });
});
