import { message, open } from "@/lib/dialog";
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  stat,
  writeFile,
  writeTextFile,
} from "@/lib/fs";
import { Note, Tag, ZeroSortState } from "@/types";
import { getAllDirectories } from "./db/directories";
import { getAllNotesWithContent } from "./db/notes";
import { getAllTags } from "./db/tags";
import {
  createUniqueExportStem,
  prepareManagedImageExportPlan,
  sanitizeExportPathSegment,
} from "./exportAssets";
import {
  extractManagedImagePathsFromContent,
  readManagedImageFile,
} from "./images";
import { markdownToTiptapJson, tiptapJsonToMarkdown } from "./markdown";

const EXPORT_YIELD_INTERVAL = 10;

export interface IoProgress {
  current: number;
  total: number;
  phase: "scanning" | "processing" | "saving";
}

export type IoProgressCallback = (progress: IoProgress) => void;

interface MarkdownImportItem {
  path: string;
  name: string;
  catalog: string[];
  createdAt: string;
  updatedAt: string;
}

// Helper for generating deterministic or random IDs for imports
const generateId = () => crypto.randomUUID();

function isMarkdownFileName(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

/**
 * Builds YAML frontmatter string for a note's tags.
 */
function buildFrontmatter(tagNames: string[]): string {
  if (tagNames.length === 0) return "";
  const tagList = tagNames.map((t) => `  - ${t}`).join("\n");
  return `---\ntags:\n${tagList}\n---\n\n`;
}

/**
 * Parses YAML frontmatter from markdown content, extracting tags.
 * Returns the tags array and the content without frontmatter.
 */
function parseFrontmatter(content: string): {
  tags: string[];
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/);
  if (!match) return { tags: [], body: content };

  const frontmatter = match[1];
  const body = content.slice(match[0].length);
  const tags: string[] = [];

  // Parse tags from YAML-style list
  const tagMatch = frontmatter.match(/tags:\s*\n((?:\s+-\s+.+\n?)*)/);
  if (tagMatch) {
    const lines = tagMatch[1].trim().split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*-\s+(.+)/);
      if (m) tags.push(m[1].trim());
    }
  }

  return { tags, body };
}

function getImportedTitle(fileName: string): string {
  return fileName.replace(/\.(md|markdown)$/i, "");
}

async function ensureDirectory(path: string): Promise<void> {
  const directoryExists = await exists(path);
  if (!directoryExists) {
    await mkdir(path, { recursive: true });
  }
}

async function ensureDirectoryCached(
  path: string,
  ensuredDirectories: Set<string>,
): Promise<void> {
  if (ensuredDirectories.has(path)) {
    return;
  }

  await ensureDirectory(path);
  ensuredDirectories.add(path);
}

async function yieldToMainThread(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function getImportedNoteTimestamps(fileInfo: {
  birthtime: Date | null;
  mtime: Date | null;
}): {
  createdAt: string;
  updatedAt: string;
} {
  const now = new Date().toISOString();

  return {
    createdAt:
      fileInfo.birthtime?.toISOString() || fileInfo.mtime?.toISOString() || now,
    updatedAt:
      fileInfo.mtime?.toISOString() || fileInfo.birthtime?.toISOString() || now,
  };
}

async function importMarkdownItems(
  items: MarkdownImportItem[],
  store: ZeroSortState,
  onProgress?: IoProgressCallback,
) {
  let importedCount = 0;
  const notesToSave: { note: Note; catalog: string[]; tagNames: string[] }[] =
    [];
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const file = items[i];
    onProgress?.({ current: i + 1, total, phase: "processing" });

    const rawContent = await readTextFile(file.path);
    const { tags: tagNames, body } = parseFrontmatter(rawContent);
    const title = getImportedTitle(file.name);
    const jsonContent = markdownToTiptapJson(body);

    notesToSave.push({
      note: {
        id: generateId(),
        title,
        summary: "Imported from " + file.name,
        content: jsonContent,
        directoryId: null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        isContentLoaded: true,
        tagIds: [],
      },
      catalog: file.catalog,
      tagNames,
    });
    importedCount++;
  }

  if (notesToSave.length > 0) {
    onProgress?.({ current: 0, total: 1, phase: "saving" });
    const { bulkSaveNotes, getAllNotes } = await import("./db/notes");
    const { getAllDirectories } = await import("./db/directories");
    const { getAllTags: getTagsForImport, saveTag } = await import("./db/tags");

    // Collect unique tag names from all imported files
    const allTagNames = new Set<string>();
    for (const item of notesToSave) {
      for (const name of item.tagNames) {
        allTagNames.add(name);
      }
    }

    // Create tags that don't exist yet and build name→id map
    const tagNameToId = new Map<string, string>();
    const existingTags = await getTagsForImport();
    for (const tag of existingTags) {
      tagNameToId.set(tag.name.toLowerCase(), tag.id);
    }

    const tagsToCreate = Array.from(allTagNames)
      .filter((name) => !tagNameToId.has(name.toLowerCase()))
      .map((name) => ({
        id: generateId(),
        name,
        color: null,
        createdAt: new Date().toISOString(),
      }));

    await Promise.all(tagsToCreate.map((tag) => saveTag(tag)));
    for (const tag of tagsToCreate) {
      tagNameToId.set(tag.name.toLowerCase(), tag.id);
    }

    // Assign tagIds to notes based on tag names
    for (const item of notesToSave) {
      item.note.tagIds = item.tagNames
        .map((n) => tagNameToId.get(n.toLowerCase()))
        .filter((id): id is string => !!id);
    }

    await bulkSaveNotes(notesToSave);

    const { rebuildLinksForNote } = await import("./db/noteLinks");
    for (const { note } of notesToSave) {
      try {
        await rebuildLinksForNote(note.id, note.content || "");
      } catch (error) {
        console.error(`Failed to rebuild note links for ${note.id}:`, error);
      }
    }

    const [newDirs, newNotes, newTags] = await Promise.all([
      getAllDirectories(),
      getAllNotes(),
      getAllTags(),
    ]);
    store.syncFromDb(newNotes, newDirs, newTags);
  }

  return importedCount;
}

export async function importMarkdownFolder(
  store: ZeroSortState,
  onProgress?: IoProgressCallback,
) {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Folder to Import",
    });

    if (!selected) return 0; // User cancelled

    // Host `open` dialog returns `string | string[] | null`
    const rootPath = Array.isArray(selected) ? selected[0] : selected;
    if (!rootPath) return 0;

    // Extract the folder name to use as root catalog entry
    let baseFolderName = rootPath.split(/[/\\]/).pop() || "Imported Notes";
    // It's sometimes just a drive letter on Windows so fallback
    if (!baseFolderName) baseFolderName = "Imported Notes";

    // First pass: collect all markdown file paths
    const mdFiles: MarkdownImportItem[] = [];

    async function collectFiles(dirPath: string, currentCatalog: string[]) {
      const entries = await readDir(dirPath);
      for (const entry of entries) {
        if (entry.name?.startsWith(".")) continue;
        const fullPath = `${dirPath}/${entry.name}`;
        if (entry.isDirectory) {
          await collectFiles(fullPath, [...currentCatalog, entry.name]);
        } else if (entry.isFile && isMarkdownFileName(entry.name)) {
          const fileInfo = await stat(fullPath);
          const { createdAt, updatedAt } = getImportedNoteTimestamps(fileInfo);

          mdFiles.push({
            path: fullPath,
            name: entry.name,
            catalog: currentCatalog,
            createdAt,
            updatedAt,
          });
        }
      }
    }

    onProgress?.({ current: 0, total: 0, phase: "scanning" });
    await collectFiles(rootPath, [baseFolderName]);

    return await importMarkdownItems(mdFiles, store, onProgress);
  } catch (err) {
    console.error("Failed to import folder:", err);
    await message("Failed to import folder: " + String(err), {
      title: "Import Error",
      kind: "error",
    });
    return 0;
  }
}

export async function importMarkdownFiles(
  store: ZeroSortState,
  onProgress?: IoProgressCallback,
) {
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Select Markdown Files to Import",
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown"],
        },
      ],
    });

    if (!selected) return 0;

    const selectedPaths = Array.isArray(selected) ? selected : [selected];
    if (selectedPaths.length === 0) return 0;

    onProgress?.({
      current: 0,
      total: selectedPaths.length,
      phase: "scanning",
    });

    const mdFiles = (
      await Promise.all(
        selectedPaths.map(async (filePath) => {
          const normalizedPath = filePath.replace(/\\/g, "/");
          const name = normalizedPath.split("/").pop() || "Untitled.md";

          if (!isMarkdownFileName(name)) return null;

          const fileInfo = await stat(filePath);
          const { createdAt, updatedAt } = getImportedNoteTimestamps(fileInfo);

          return {
            path: filePath,
            name,
            catalog: [] as string[],
            createdAt,
            updatedAt,
          };
        }),
      )
    ).filter((file): file is MarkdownImportItem => !!file);

    return await importMarkdownItems(mdFiles, store, onProgress);
  } catch (err) {
    console.error("Failed to import files:", err);
    await message("Failed to import files: " + String(err), {
      title: "Import Error",
      kind: "error",
    });
    return 0;
  }
}

export async function exportToMarkdownFolder(onProgress?: IoProgressCallback) {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Export Destination",
    });

    if (!selected) return 0; // User cancelled

    const rootPath = Array.isArray(selected) ? selected[0] : selected;
    if (!rootPath) return 0;

    // Fetch all directories, notes, and tags
    const directories = await getAllDirectories();
    const notes = (await getAllNotesWithContent("createdAt")).sort((a, b) => {
      const createdAtComparison = b.createdAt.localeCompare(a.createdAt);
      return createdAtComparison !== 0
        ? createdAtComparison
        : a.id.localeCompare(b.id);
    });
    const allTags = await getAllTags();

    // Build a map for quick directory lookups
    const dirMap = new Map<string, any>(directories.map((d) => [d.id, d]));
    const tagMap = new Map<string, Tag>(allTags.map((t) => [t.id, t]));
    const ensuredDirectories = new Set<string>([rootPath]);
    const dirPathCache = new Map<string, string[]>();
    const reservedExportStems = new Map<string, Set<string>>();

    // Helper to get full path array for a directory
    const getDirPath = (dirId: string | null): string[] => {
      if (!dirId) return [];
      const cachedPath = dirPathCache.get(dirId);
      if (cachedPath) return cachedPath;

      const dir = dirMap.get(dirId);
      if (!dir) return [];

      const resolvedPath = [...getDirPath(dir.parentId), dir.name];
      dirPathCache.set(dirId, resolvedPath);
      return resolvedPath;
    };

    const getTargetDir = (note: Note): string => {
      const pathArray = getDirPath(note.directoryId);
      const pathString = pathArray
        .map((p) => p.replace(/[<>:"/\\|?*]+/g, "_"))
        .join("/");

      return pathString ? `${rootPath}/${pathString}` : rootPath;
    };

    const exportStemByNoteId = new Map<string, string>();
    for (const note of notes) {
      if (!note.content) continue;

      const targetDir = getTargetDir(note);
      const usedStems = reservedExportStems.get(targetDir) ?? new Set<string>();
      const baseStem = sanitizeExportPathSegment(note.title);
      const exportStem = createUniqueExportStem(baseStem, usedStems);

      usedStems.add(exportStem);
      reservedExportStems.set(targetDir, usedStems);
      exportStemByNoteId.set(note.id, exportStem);
    }

    let exportedCount = 0;
    const total = notes.length;

    for (let i = 0; i < total; i++) {
      const note = notes[i];
      if (!note.content) continue; // Skip empty content just in case

      onProgress?.({ current: i + 1, total, phase: "processing" });

      const pathArray = getDirPath(note.directoryId);
      const targetDir = getTargetDir(note);
      if (pathArray.length > 0) {
        await ensureDirectoryCached(targetDir, ensuredDirectories);
      }

      const imagePaths = extractManagedImagePathsFromContent(
        note.content,
        note.id,
      );
      const exportStem =
        exportStemByNoteId.get(note.id) ??
        sanitizeExportPathSegment(note.title);
      const exportPlan = prepareManagedImageExportPlan(exportStem, imagePaths);
      const filePath = `${targetDir}/${exportPlan.exportStem}.md`;

      let markdownPathBySource = new Map<string, string>();

      if (exportPlan.assets.length > 0) {
        const assetDirectoryPath = `${targetDir}/${exportPlan.assetDirectoryName}`;
        await ensureDirectoryCached(assetDirectoryPath, ensuredDirectories);

        for (const asset of exportPlan.assets) {
          const bytes = await readManagedImageFile(asset.sourcePath);
          await writeFile(`${assetDirectoryPath}/${asset.fileName}`, bytes);
          markdownPathBySource.set(asset.sourcePath, asset.markdownPath);
        }
      }

      const mdContent = tiptapJsonToMarkdown(note.content, {
        transformImageSource: (source) =>
          markdownPathBySource.get(source) || source,
      });

      // Build frontmatter with tags
      const tagNames = (note.tagIds ?? [])
        .map((id) => tagMap.get(id)?.name)
        .filter((n): n is string => !!n);
      const frontmatter = buildFrontmatter(tagNames);

      await writeTextFile(filePath, frontmatter + mdContent);
      exportedCount++;

      if ((i + 1) % EXPORT_YIELD_INTERVAL === 0) {
        await yieldToMainThread();
      }
    }

    return exportedCount;
  } catch (err) {
    console.error("Failed to export notes:", err);
    await message("Failed to export notes: " + String(err), {
      title: "Export Error",
      kind: "error",
    });
    return 0;
  }
}
