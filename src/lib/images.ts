import {
  appDataDir,
  convertFileSrc,
  invoke,
  joinPath,
} from "@/lib/desktop-adapter";
import { readFile } from "@/lib/fs";

const MANAGED_IMAGE_DIRECTORY = "images";
const MANAGED_IMAGE_PREFIX = `${MANAGED_IMAGE_DIRECTORY}/`;
const FALLBACK_NOTE_ID = "unassigned";

interface SaveImageFileResponse {
  relativePath: string;
  absolutePath: string;
}

interface ManagedImageMetadataResponse {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface ManagedImageFile {
  relativePath: string;
  absolutePath: string;
  assetUrl: string;
}

export interface ManagedImageMetadata {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

interface ContentCarrier {
  id?: string;
  content?: string | null;
}

interface TiptapJsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
}

let appDataDirPromise: Promise<string> | null = null;
const managedImageUrlCache = new Map<string, Promise<string>>();
const MANAGED_IMAGE_URL_CACHE_LIMIT = 200;
const pendingManagedImagePathsByNote = new Map<string, Set<string>>();

function addPendingManagedImagePath(noteId: string | undefined, path: string) {
  if (!isManagedImagePath(path)) {
    return;
  }

  const bucket = getManagedImageNoteId(noteId);
  let pendingPaths = pendingManagedImagePathsByNote.get(bucket);

  if (!pendingPaths) {
    pendingPaths = new Set<string>();
    pendingManagedImagePathsByNote.set(bucket, pendingPaths);
  }

  pendingPaths.add(normalizeManagedImagePath(path));
}

function takePendingManagedImagePaths(noteId: string | undefined): string[] {
  const bucket = getManagedImageNoteId(noteId);
  const pendingPaths = pendingManagedImagePathsByNote.get(bucket);

  if (!pendingPaths || pendingPaths.size === 0) {
    return [];
  }

  pendingManagedImagePathsByNote.delete(bucket);
  return Array.from(pendingPaths);
}

function removePendingManagedImagePath(path: string) {
  const normalizedPath = normalizeManagedImagePath(path);

  for (const [bucket, pendingPaths] of pendingManagedImagePathsByNote) {
    pendingPaths.delete(normalizedPath);

    if (pendingPaths.size === 0) {
      pendingManagedImagePathsByNote.delete(bucket);
    }
  }
}

async function deleteManagedImageFiles(paths: string[]): Promise<void> {
  for (const path of new Set(paths)) {
    await deleteManagedImageFile(path);
  }
}

/** Returns the normalized note bucket used for managed image storage. */
export function getManagedImageNoteId(noteId?: string): string {
  return noteId?.trim() || FALLBACK_NOTE_ID;
}

/** Normalizes a managed image path into a forward-slash relative path. */
export function normalizeManagedImagePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Checks whether an image source points to a managed local image path. */
export function isManagedImagePath(path: string): boolean {
  const normalizedPath = normalizeManagedImagePath(path);
  return normalizedPath.startsWith(MANAGED_IMAGE_PREFIX);
}

/** Checks whether an image source is a legacy base64 image payload. */
export function isLegacyBase64ImageSrc(path: string): boolean {
  return path.startsWith("data:image/");
}

/** Saves a local image file into the managed app-data image directory. */
export async function saveManagedImageFile(
  noteId: string | undefined,
  file: File,
): Promise<ManagedImageFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return saveManagedImageBytes(noteId, bytes, file.name || null);
}

/** Saves a local image from an absolute file path into managed app-data storage. */
export async function saveManagedImagePath(
  noteId: string | undefined,
  path: string,
): Promise<ManagedImageFile> {
  const normalizedPath = path.replace(/\\/g, "/");
  const originalName = normalizedPath.split("/").pop() || null;
  return saveManagedImageBytes(noteId, await readFile(path), originalName);
}

async function saveManagedImageBytes(
  noteId: string | undefined,
  bytes: Uint8Array,
  originalName: string | null,
): Promise<ManagedImageFile> {
  const result = await invoke<SaveImageFileResponse>("save_image_file", {
    noteId: getManagedImageNoteId(noteId),
    bytes: Array.from(bytes),
    originalName,
  });
  const relativePath = normalizeManagedImagePath(result.relativePath);
  addPendingManagedImagePath(noteId, relativePath);

  return {
    relativePath,
    absolutePath: result.absolutePath,
    assetUrl: convertFileSrc(result.absolutePath),
  };
}

/** Deletes a managed local image file if it belongs to the app image directory. */
export async function deleteManagedImageFile(path: string): Promise<void> {
  if (!isManagedImagePath(path)) {
    return;
  }

  const relativePath = normalizeManagedImagePath(path);
  removePendingManagedImagePath(relativePath);
  managedImageUrlCache.delete(relativePath);
  await invoke("delete_image_file", { relativePath });
}

/** Reads the raw bytes of a managed local image file. */
export async function readManagedImageFile(path: string): Promise<Uint8Array> {
  const relativePath = normalizeManagedImagePath(path);
  const bytes = await invoke<number[] | Uint8Array>("read_managed_image_file", {
    relativePath,
  });
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
}

/** Writes raw bytes into a managed local image path. */
export async function writeManagedImageFile(
  path: string,
  bytes: Uint8Array,
): Promise<ManagedImageMetadata> {
  const relativePath = normalizeManagedImagePath(path);
  const result = await invoke<ManagedImageMetadataResponse>(
    "write_managed_image_file",
    {
      relativePath,
      bytes: Array.from(bytes),
    },
  );

  return result;
}

/** Returns metadata for a managed local image path if the file exists. */
export async function getManagedImageMetadata(
  path: string,
): Promise<ManagedImageMetadata | null> {
  const relativePath = normalizeManagedImagePath(path);
  const result = await invoke<ManagedImageMetadataResponse | null>(
    "get_managed_image_metadata",
    {
      relativePath,
    },
  );

  return result;
}

/** Resolves a stored managed image path into a renderable local asset URL. */
export async function resolveManagedImageSrc(path: string): Promise<string> {
  if (!isManagedImagePath(path)) {
    return path;
  }

  const relativePath = normalizeManagedImagePath(path);
  let cachedUrl = managedImageUrlCache.get(relativePath);

  if (!cachedUrl) {
    cachedUrl = (async () => {
      if (!appDataDirPromise) {
        appDataDirPromise = appDataDir();
      }

      const dataDir = await appDataDirPromise;
      const absolutePath = await joinPath(dataDir, relativePath);
      return convertFileSrc(absolutePath);
    })().catch((error) => {
      managedImageUrlCache.delete(relativePath);
      throw error;
    });

    managedImageUrlCache.set(relativePath, cachedUrl);

    if (managedImageUrlCache.size > MANAGED_IMAGE_URL_CACHE_LIMIT) {
      const oldestKey = managedImageUrlCache.keys().next().value;
      if (oldestKey) {
        managedImageUrlCache.delete(oldestKey);
      }
    }
  }

  return cachedUrl;
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0, len = str.length; i < len; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

const imageExtractionCache = new Map<
  string,
  { contentHash: number; paths: string[] }
>();
const IMAGE_EXTRACTION_CACHE_LIMIT = 20;

function parseImagePaths(content: string): string[] {
  const json = JSON.parse(content) as TiptapJsonNode;
  const imagePaths = new Set<string>();

  const walkNode = (node: TiptapJsonNode) => {
    if (node.type === "image") {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      if (src && isManagedImagePath(src)) {
        imagePaths.add(normalizeManagedImagePath(src));
      }
    }

    node.content?.forEach(walkNode);
  };

  walkNode(json);
  return Array.from(imagePaths);
}

/** Extracts all managed local image paths referenced inside Tiptap JSON content. */
export function extractManagedImagePathsFromContent(
  content: string,
  noteId?: string,
): string[] {
  if (!content) {
    return [];
  }

  if (noteId) {
    const contentHash = hashString(content);
    const cached = imageExtractionCache.get(noteId);

    if (cached && cached.contentHash === contentHash) {
      // Refresh LRU position
      imageExtractionCache.delete(noteId);
      imageExtractionCache.set(noteId, cached);
      return cached.paths;
    }

    try {
      const paths = parseImagePaths(content);
      imageExtractionCache.set(noteId, { contentHash, paths });

      if (imageExtractionCache.size > IMAGE_EXTRACTION_CACHE_LIMIT) {
        const oldestKey = imageExtractionCache.keys().next().value;
        if (oldestKey) {
          imageExtractionCache.delete(oldestKey);
        }
      }

      return paths;
    } catch {
      imageExtractionCache.delete(noteId);
      return [];
    }
  }

  try {
    return parseImagePaths(content);
  } catch {
    return [];
  }
}

/** Returns managed image paths removed between a previous and next Tiptap JSON payload. */
export function getRemovedManagedImagePaths(
  previousContent: string,
  nextContent: string,
  noteId?: string,
): string[] {
  const previousPaths = extractManagedImagePathsFromContent(
    previousContent,
    noteId,
  );

  if (previousPaths.length === 0) {
    return [];
  }

  const nextPaths = new Set(
    extractManagedImagePathsFromContent(nextContent, noteId),
  );

  return previousPaths.filter((path) => !nextPaths.has(path));
}

/** Returns managed image paths from a candidate set that are not referenced by the provided content. */
export function getManagedImagePathsMissingFromContent(
  content: string,
  candidatePaths: Iterable<string>,
  noteId?: string,
): string[] {
  const referencedPaths = new Set(
    extractManagedImagePathsFromContent(content, noteId),
  );
  const missingPaths = new Set<string>();

  for (const path of candidatePaths) {
    if (!isManagedImagePath(path)) {
      continue;
    }

    const normalizedPath = normalizeManagedImagePath(path);
    if (!referencedPaths.has(normalizedPath)) {
      missingPaths.add(normalizedPath);
    }
  }

  return Array.from(missingPaths);
}

/** Finalizes pending managed image uploads for a note after a successful save. */
export async function finalizePendingManagedImageFiles(
  noteId: string | undefined,
  content: string,
): Promise<void> {
  const pendingPaths = takePendingManagedImagePaths(noteId);

  if (pendingPaths.length === 0) {
    return;
  }

  const pathsToDelete = getManagedImagePathsMissingFromContent(
    content,
    pendingPaths,
    noteId,
  );

  await deleteManagedImageFiles(pathsToDelete);
}

/** Deletes all pending managed image uploads for a note that was discarded. */
export async function discardPendingManagedImageFiles(
  noteId: string | undefined,
): Promise<void> {
  const pendingPaths = takePendingManagedImagePaths(noteId);

  if (pendingPaths.length === 0) {
    return;
  }

  await deleteManagedImageFiles(pendingPaths);
}

/** Extracts all managed image paths referenced across a collection of note-like records. */
export function extractManagedImagePathsFromRecords(
  records: ContentCarrier[],
): string[] {
  const uniquePaths = new Set<string>();

  for (const record of records) {
    const imagePaths = extractManagedImagePathsFromContent(
      record.content || "",
      record.id,
    );
    imagePaths.forEach((path) => uniquePaths.add(path));
  }

  return Array.from(uniquePaths);
}
