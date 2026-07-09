/**
 * Tests for the IO helpers - markdown import/export regressions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dialog", () => ({
  message: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/lib/fs", () => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("../db/directories", () => ({
  getAllDirectories: vi.fn().mockResolvedValue([]),
}));

vi.mock("../db/notes", () => ({
  bulkSaveNotes: vi.fn(),
  getAllNotes: vi.fn().mockResolvedValue([]),
  getAllNotesWithContent: vi.fn().mockResolvedValue([]),
}));

vi.mock("../db/noteLinks", () => ({
  rebuildLinksForNote: vi.fn(),
}));

vi.mock("../db/tags", () => ({
  getAllTags: vi.fn().mockResolvedValue([]),
  getTagByName: vi.fn(),
  saveTag: vi.fn(),
}));

vi.mock("../exportAssets", () => ({
  createUniqueExportStem: vi.fn((baseStem: string, usedStems: Set<string>) => {
    let candidate = baseStem;
    let suffix = 2;

    while (usedStems.has(candidate)) {
      candidate = `${baseStem}-${suffix}`;
      suffix++;
    }

    return candidate;
  }),
  prepareManagedImageExportPlan: vi.fn(),
  sanitizeExportPathSegment: vi.fn((value: string) => {
    const sanitizedValue = value.replace(/[<>:"/\\|?*]+/g, "_").trim();
    return sanitizedValue || "Untitled";
  }),
}));

vi.mock("../images", () => ({
  extractManagedImagePathsFromContent: vi.fn(),
  readManagedImageFile: vi.fn(),
}));

vi.mock("../markdown", () => ({
  markdownToTiptapJson: vi.fn().mockReturnValue('{"type":"doc","content":[]}'),
  tiptapJsonToMarkdown: vi.fn(),
}));

import { open } from "@/lib/dialog";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  stat,
  writeFile,
  writeTextFile,
} from "@/lib/fs";

import { getAllDirectories } from "../db/directories";
import { rebuildLinksForNote } from "../db/noteLinks";
import {
  bulkSaveNotes,
  getAllNotes,
  getAllNotesWithContent,
} from "../db/notes";
import { getAllTags, saveTag } from "../db/tags";
import { prepareManagedImageExportPlan } from "../exportAssets";
import {
  extractManagedImagePathsFromContent,
  readManagedImageFile,
} from "../images";
import {
  exportToMarkdownFolder,
  importMarkdownFiles,
  importMarkdownFolder,
} from "../io";
import { tiptapJsonToMarkdown } from "../markdown";

describe("IO helpers - markdown import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (exists as any).mockResolvedValue(false);
    (getAllDirectories as any).mockResolvedValue([]);
    (getAllNotes as any).mockResolvedValue([]);
    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllTags as any).mockResolvedValue([]);
    (stat as any).mockResolvedValue({
      birthtime: new Date("2025-01-02T03:04:05.000Z"),
      mtime: new Date("2025-02-03T04:05:06.000Z"),
    });
  });

  it("Should import all tags from YAML frontmatter when the first tag is indented", async () => {
    (open as any).mockResolvedValue(["/tmp/imported-note.md"]);
    (readTextFile as any).mockResolvedValue(`---
tags:
  - 富文本编辑器
  - 前端开发
  - 插件扩展
---

Body text`);

    const store = {
      syncFromDb: vi.fn(),
    } as any;

    const count = await importMarkdownFiles(store);

    expect(count).toBe(1);
    expect(saveTag).toHaveBeenCalledTimes(3);
    expect(saveTag).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: "富文本编辑器" }),
    );
    expect(saveTag).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "前端开发" }),
    );
    expect(saveTag).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ name: "插件扩展" }),
    );
    expect(bulkSaveNotes).toHaveBeenCalledWith([
      expect.objectContaining({
        note: expect.objectContaining({
          createdAt: "2025-01-02T03:04:05.000Z",
          tagIds: expect.arrayContaining([
            expect.any(String),
            expect.any(String),
            expect.any(String),
          ]),
          updatedAt: "2025-02-03T04:05:06.000Z",
        }),
        tagNames: ["富文本编辑器", "前端开发", "插件扩展"],
      }),
    ]);
    expect(store.syncFromDb).toHaveBeenCalledWith([], [], []);
  });

  it("Should fall back to modified time when file birthtime is unavailable", async () => {
    (open as any).mockResolvedValue(["/tmp/imported-note.md"]);
    (readTextFile as any).mockResolvedValue("Body text");
    (stat as any).mockResolvedValue({
      birthtime: null,
      mtime: new Date("2025-03-04T05:06:07.000Z"),
    });

    const store = {
      syncFromDb: vi.fn(),
    } as any;

    const count = await importMarkdownFiles(store);

    expect(count).toBe(1);
    expect(bulkSaveNotes).toHaveBeenCalledWith([
      expect.objectContaining({
        note: expect.objectContaining({
          createdAt: "2025-03-04T05:06:07.000Z",
          updatedAt: "2025-03-04T05:06:07.000Z",
        }),
      }),
    ]);
  });

  it("Should import folder notes using file timestamps from stat metadata", async () => {
    (open as any).mockResolvedValue("/tmp/import-folder");
    (readDir as any).mockResolvedValue([
      {
        name: "nested",
        isDirectory: true,
        isFile: false,
      },
      {
        name: "ignore.txt",
        isDirectory: false,
        isFile: true,
      },
    ]);
    (readDir as any).mockResolvedValueOnce([
      {
        name: "nested",
        isDirectory: true,
        isFile: false,
      },
      {
        name: "ignore.txt",
        isDirectory: false,
        isFile: true,
      },
    ]);
    (readDir as any).mockResolvedValueOnce([
      {
        name: "nested-note.md",
        isDirectory: false,
        isFile: true,
      },
    ]);
    (readTextFile as any).mockResolvedValue("Folder body");
    (stat as any).mockResolvedValue({
      birthtime: new Date("2024-06-07T08:09:10.000Z"),
      mtime: new Date("2024-07-08T09:10:11.000Z"),
    });

    const store = {
      syncFromDb: vi.fn(),
    } as any;

    const count = await importMarkdownFolder(store);

    expect(count).toBe(1);
    expect(stat).toHaveBeenCalledWith(
      "/tmp/import-folder/nested/nested-note.md",
    );
    expect(bulkSaveNotes).toHaveBeenCalledWith([
      expect.objectContaining({
        catalog: ["import-folder", "nested"],
        note: expect.objectContaining({
          createdAt: "2024-06-07T08:09:10.000Z",
          updatedAt: "2024-07-08T09:10:11.000Z",
        }),
      }),
    ]);
  });

  it("Should rebuild note links after importing markdown notes", async () => {
    (open as any).mockResolvedValue(["/tmp/source.md", "/tmp/target.md"]);
    (readTextFile as any)
      .mockResolvedValueOnce("See [[Target]].")
      .mockResolvedValueOnce("Target body");

    const store = {
      syncFromDb: vi.fn(),
    } as any;

    const count = await importMarkdownFiles(store);

    expect(count).toBe(2);
    expect(rebuildLinksForNote).toHaveBeenCalledTimes(2);
    expect(rebuildLinksForNote).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      '{"type":"doc","content":[]}',
    );
    expect(rebuildLinksForNote).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      '{"type":"doc","content":[]}',
    );
  });

  it("Should strip imported calendar and kanban blocks for unlicensed users", async () => {
    (open as any).mockResolvedValue(["/tmp/imported-note.md"]);
    (readTextFile as any).mockResolvedValue("Imported body");
    const importedJson = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        },
        {
          type: "calendar",
          attrs: { calendarData: "{}", height: 1280 },
        },
        {
          type: "kanban",
          attrs: { kanbanData: "{}", height: 760 },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After" }],
        },
      ],
    });
    (
      vi.mocked(await import("../markdown")).markdownToTiptapJson as any
    ).mockReturnValueOnce(importedJson);

    const store = {
      licenseStatus: "none",
      syncFromDb: vi.fn(),
    } as any;

    const count = await importMarkdownFiles(store);

    expect(count).toBe(1);
    expect(bulkSaveNotes).toHaveBeenCalledWith([
      expect.objectContaining({
        note: expect.objectContaining({
          content: JSON.stringify({
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Before" }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: "After" }],
              },
            ],
          }),
        }),
      }),
    ]);
  });
});

describe("IO helpers - markdown export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (exists as any).mockResolvedValue(false);
    (getAllDirectories as any).mockResolvedValue([]);
    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllTags as any).mockResolvedValue([]);
    (extractManagedImagePathsFromContent as any).mockReturnValue([]);
    (prepareManagedImageExportPlan as any).mockImplementation(
      (exportStem: string) => ({
        exportStem,
        assetDirectoryName: `${exportStem}.assets`,
        assets: [],
      }),
    );
    (tiptapJsonToMarkdown as any).mockReturnValue("Exported body");
  });

  it("Should export markdown with tag frontmatter and managed image assets", async () => {
    (open as any).mockResolvedValue("/tmp/export-root");
    (getAllDirectories as any).mockResolvedValue([
      { id: "dir-1", name: "Work", parentId: null },
    ]);
    (getAllTags as any).mockResolvedValue([
      {
        id: "tag-1",
        name: "Project",
        color: null,
        createdAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-1",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: ["tag-1"],
      },
    ]);
    (extractManagedImagePathsFromContent as any).mockReturnValue([
      "images/note-1/photo.png",
    ]);
    (prepareManagedImageExportPlan as any).mockReturnValue({
      exportStem: "Trip Notes",
      assetDirectoryName: "Trip Notes.assets",
      assets: [
        {
          sourcePath: "images/note-1/photo.png",
          fileName: "photo.png",
          markdownPath: "./Trip Notes.assets/photo.png",
        },
      ],
    });
    (readManagedImageFile as any).mockResolvedValue(new Uint8Array([1, 2, 3]));
    (tiptapJsonToMarkdown as any).mockImplementation(
      (
        _content: string,
        options?: { transformImageSource?: (source: string) => string },
      ) =>
        `Image path: ${options?.transformImageSource?.("images/note-1/photo.png")}`,
    );

    const count = await exportToMarkdownFolder();

    expect(count).toBe(1);
    expect(mkdir).toHaveBeenCalledWith("/tmp/export-root/Work", {
      recursive: true,
    });
    expect(mkdir).toHaveBeenCalledWith(
      "/tmp/export-root/Work/Trip Notes.assets",
      {
        recursive: true,
      },
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/export-root/Work/Trip Notes.assets/photo.png",
      new Uint8Array([1, 2, 3]),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/tmp/export-root/Work/Trip Notes.md",
      "---\ntags:\n  - Project\n---\n\nImage path: ./Trip Notes.assets/photo.png",
    );
  });

  it("Should avoid redundant directory creation checks for notes in the same folder", async () => {
    (open as any).mockResolvedValue("/tmp/export-root");
    (getAllDirectories as any).mockResolvedValue([
      { id: "dir-1", name: "Work", parentId: null },
    ]);
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-1",
        title: "First Note",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
      {
        id: "note-2",
        title: "Second Note",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
    ]);

    const count = await exportToMarkdownFolder();

    expect(count).toBe(2);
    expect(exists).toHaveBeenCalledTimes(1);
    expect(exists).toHaveBeenCalledWith("/tmp/export-root/Work");
    expect(mkdir).toHaveBeenCalledTimes(1);
    expect(mkdir).toHaveBeenCalledWith("/tmp/export-root/Work", {
      recursive: true,
    });
  });

  it("Should suffix duplicate note titles in the same export folder", async () => {
    (open as any).mockResolvedValue("/tmp/export-root");
    (getAllDirectories as any).mockResolvedValue([
      { id: "dir-1", name: "Work", parentId: null },
    ]);
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-2",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
      {
        id: "note-1",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
    ]);

    const count = await exportToMarkdownFolder();

    expect(count).toBe(2);
    expect(writeTextFile).toHaveBeenNthCalledWith(
      1,
      "/tmp/export-root/Work/Trip Notes.md",
      "Exported body",
    );
    expect(writeTextFile).toHaveBeenNthCalledWith(
      2,
      "/tmp/export-root/Work/Trip Notes-2.md",
      "Exported body",
    );
  });

  it("Should suffix titles after sanitization when export stems collide", async () => {
    (open as any).mockResolvedValue("/tmp/export-root");
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-1",
        title: "Bad/Title",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: null,
        createdAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
      {
        id: "note-2",
        title: "Bad:Title",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
    ]);

    const count = await exportToMarkdownFolder();

    expect(count).toBe(2);
    expect(writeTextFile).toHaveBeenNthCalledWith(
      1,
      "/tmp/export-root/Bad_Title.md",
      "Exported body",
    );
    expect(writeTextFile).toHaveBeenNthCalledWith(
      2,
      "/tmp/export-root/Bad_Title-2.md",
      "Exported body",
    );
  });

  it("Should keep identical note titles unsuffixed across different folders", async () => {
    (open as any).mockResolvedValue("/tmp/export-root");
    (getAllDirectories as any).mockResolvedValue([
      { id: "dir-1", name: "Work", parentId: null },
      { id: "dir-2", name: "Personal", parentId: null },
    ]);
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-1",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
      {
        id: "note-2",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-2",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
    ]);

    const count = await exportToMarkdownFolder();

    expect(count).toBe(2);
    expect(writeTextFile).toHaveBeenCalledWith(
      "/tmp/export-root/Work/Trip Notes.md",
      "Exported body",
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "/tmp/export-root/Personal/Trip Notes.md",
      "Exported body",
    );
  });

  it("Should keep asset folders aligned with suffixed markdown export stems", async () => {
    (open as any).mockResolvedValue("/tmp/export-root");
    (getAllDirectories as any).mockResolvedValue([
      { id: "dir-1", name: "Work", parentId: null },
    ]);
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-2",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
      {
        id: "note-1",
        title: "Trip Notes",
        summary: "",
        content: '{"type":"doc","content":[]}',
        directoryId: "dir-1",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        isContentLoaded: true,
        tagIds: [],
      },
    ]);
    (extractManagedImagePathsFromContent as any)
      .mockReturnValueOnce(["images/note-2/photo.png"])
      .mockReturnValueOnce(["images/note-1/photo.png"]);
    (prepareManagedImageExportPlan as any)
      .mockReturnValueOnce({
        exportStem: "Trip Notes",
        assetDirectoryName: "Trip Notes.assets",
        assets: [
          {
            sourcePath: "images/note-2/photo.png",
            fileName: "photo.png",
            markdownPath: "./Trip Notes.assets/photo.png",
          },
        ],
      })
      .mockReturnValueOnce({
        exportStem: "Trip Notes-2",
        assetDirectoryName: "Trip Notes-2.assets",
        assets: [
          {
            sourcePath: "images/note-1/photo.png",
            fileName: "photo.png",
            markdownPath: "./Trip Notes-2.assets/photo.png",
          },
        ],
      });
    (readManagedImageFile as any).mockResolvedValue(new Uint8Array([1, 2, 3]));
    (tiptapJsonToMarkdown as any)
      .mockImplementationOnce(
        (
          _content: string,
          options?: { transformImageSource?: (source: string) => string },
        ) =>
          `Image path: ${options?.transformImageSource?.("images/note-2/photo.png")}`,
      )
      .mockImplementationOnce(
        (
          _content: string,
          options?: { transformImageSource?: (source: string) => string },
        ) =>
          `Image path: ${options?.transformImageSource?.("images/note-1/photo.png")}`,
      );

    const count = await exportToMarkdownFolder();

    expect(count).toBe(2);
    expect(mkdir).toHaveBeenCalledWith(
      "/tmp/export-root/Work/Trip Notes.assets",
      { recursive: true },
    );
    expect(mkdir).toHaveBeenCalledWith(
      "/tmp/export-root/Work/Trip Notes-2.assets",
      { recursive: true },
    );
    expect(writeTextFile).toHaveBeenNthCalledWith(
      1,
      "/tmp/export-root/Work/Trip Notes.md",
      "Image path: ./Trip Notes.assets/photo.png",
    );
    expect(writeTextFile).toHaveBeenNthCalledWith(
      2,
      "/tmp/export-root/Work/Trip Notes-2.md",
      "Image path: ./Trip Notes-2.assets/photo.png",
    );
  });
});
