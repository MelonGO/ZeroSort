/**
 * State Collector for the Three-Way Comparison Sync Model.
 *
 * Collects entity states from three sources:
 * - Local (L): SQLite database (notes and directories)
 * - Remote (R): S3 bucket (listed objects)
 * - PrevSync (B): sync_records table (last successful sync state)
 */

import { getSyncRecordsByProfile, type SyncRecord } from "@/lib/db/syncRecords";
import {
  extractManagedImagePathsFromRecords,
  getManagedImageMetadata,
} from "@/lib/images";
import type { Directory, Note, Tag } from "@/types";
import { generateSyncKey, parseSyncKey, type SyncEntity } from "@/types/sync";
import { getEncryptedSyncByteSize } from "./encryption";
import { listSyncObjects, type SyncObjectInfo } from "./s3";
import {
  estimateDirectorySize,
  estimateNoteSize,
  estimateTagSize,
  normalizeMtime,
  parseIsoToMtime,
  parseS3Timestamp,
} from "./utils";

/**
 * Collected state from all three sources.
 */
export interface CollectedState {
  /** Local entities from SQLite */
  local: Map<string, SyncEntity>;
  /** Remote entities from S3 */
  remote: Map<string, SyncEntity>;
  /** Previous sync records from sync_records table */
  prevSync: Map<string, SyncEntity>;
  /** Managed image keys still referenced by local note content. */
  localImageReferences: Set<string>;
  /** Managed image keys that could not be read safely from local storage. */
  unsafeLocalImages: Map<string, string>;
}

/** Result of collecting local database and managed image state. */
export interface LocalCollectionResult {
  /** Local sync entities collected successfully. */
  entities: Map<string, SyncEntity>;
  /** Managed image keys still referenced by local notes. */
  localImageReferences: Set<string>;
  /** Managed image keys that are referenced locally but unreadable. */
  unsafeLocalImages: Map<string, string>;
}

/**
 * Options for collecting state.
 */
export interface CollectOptions {
  /** The sync profile ID */
  profileId: string;
  /** S3 connection ID */
  connectionId: string;
  /** S3 bucket name */
  bucketName: string;
  /** Optional prefix for S3 keys (e.g., "zerosort/") */
  prefix?: string;
}

/**
 * Converts a Note to a SyncEntity.
 *
 * @param note - The note to convert
 * @returns SyncEntity representation
 */
export function noteToSyncEntity(note: Note): SyncEntity {
  const key = generateSyncKey("note", note.id);
  const mtime = parseIsoToMtime(note.updatedAt || note.createdAt);

  return {
    id: note.id,
    entityType: "note",
    key,
    mtime: normalizeMtime(mtime),
    size: estimateNoteSize(note),
  };
}

/**
 * Converts a Directory to a SyncEntity.
 *
 * @param directory - The directory to convert
 * @returns SyncEntity representation
 */
export function directoryToSyncEntity(directory: Directory): SyncEntity {
  const key = generateSyncKey("directory", directory.id);
  const mtime = parseIsoToMtime(directory.updatedAt);

  return {
    id: directory.id,
    entityType: "directory",
    key,
    mtime: normalizeMtime(mtime),
    size: estimateDirectorySize(directory),
  };
}

/**
 * Converts a Tag to a SyncEntity.
 *
 * @param tag - The tag to convert
 * @returns SyncEntity representation
 */
export function tagToSyncEntity(tag: Tag): SyncEntity {
  const key = generateSyncKey("tag", tag.id);
  const mtime = parseIsoToMtime(tag.updatedAt || tag.createdAt);

  return {
    id: tag.id,
    entityType: "tag",
    key,
    mtime: normalizeMtime(mtime),
    size: estimateTagSize(tag),
  };
}

/**
 * Converts managed image metadata to a SyncEntity.
 *
 * @param imagePath - Managed image relative path
 * @param sizeBytes - Plaintext file size in bytes
 * @param modifiedAtMs - Local modified time in milliseconds
 * @returns SyncEntity representation
 */
export function imageToSyncEntity(
  imagePath: string,
  sizeBytes: number,
  modifiedAtMs: number,
): SyncEntity {
  const key = generateSyncKey("image", imagePath);

  return {
    id: key,
    entityType: "image",
    key,
    mtime: normalizeMtime(modifiedAtMs),
    size: getEncryptedSyncByteSize(sizeBytes),
  };
}

/**
 * Converts an S3 object info to a SyncEntity.
 *
 * @param obj - S3 object metadata
 * @param prefix - Optional prefix to strip from the key
 * @returns SyncEntity representation or null if invalid
 */
export function s3ObjectToSyncEntity(
  obj: SyncObjectInfo,
  prefix?: string,
): SyncEntity | null {
  // Strip prefix if provided
  let key = obj.key;
  if (prefix && key.startsWith(prefix)) {
    key = key.slice(prefix.length);
  }

  const parsed = parseSyncKey(key);
  if (!parsed) {
    return null;
  }

  const entityKey = generateSyncKey(parsed.entityType, parsed.id);

  return {
    id: parsed.id,
    entityType: parsed.entityType,
    key: entityKey,
    mtime: normalizeMtime(parseS3Timestamp(obj.last_modified)),
    size: obj.size,
  };
}

/**
 * Converts a SyncRecord to a SyncEntity.
 *
 * For prevSync entities, we populate both localMtime and remoteMtime
 * to enable accurate three-way comparison with both local and remote states.
 *
 * @param record - The sync record
 * @returns SyncEntity representation with dual mtime fields
 */
export function syncRecordToSyncEntity(record: SyncRecord): SyncEntity {
  return {
    id: record.entityId,
    entityType: record.entityType,
    key: record.key,
    // Use remoteMtime as the primary mtime for backward compatibility
    mtime: normalizeMtime(record.remoteMtime),
    size: record.size,
    etag: record.etag,
    contentHash: record.contentHash,
    // Dual mtime for accurate three-way comparison
    localMtime: normalizeMtime(record.localMtime),
    remoteMtime: normalizeMtime(record.remoteMtime),
  };
}

/**
 * Collects local state from notes, directories, and tags.
 *
 * @param notes - All notes from the database
 * @param directories - All directories from the database
 * @param tags - All tags from the database
 * @returns Map of key -> SyncEntity
 */
export async function collectLocalState(
  notes: Note[],
  directories: Directory[],
  tags: Tag[] = [],
): Promise<LocalCollectionResult> {
  const entities = new Map<string, SyncEntity>();

  for (const note of notes) {
    const entity = noteToSyncEntity(note);
    entities.set(entity.key, entity);
  }

  for (const dir of directories) {
    const entity = directoryToSyncEntity(dir);
    entities.set(entity.key, entity);
  }

  for (const tag of tags) {
    const entity = tagToSyncEntity(tag);
    entities.set(entity.key, entity);
  }

  const imagePaths = extractManagedImagePathsFromRecords(notes);
  const localImageReferences = new Set(
    imagePaths.map((imagePath) => generateSyncKey("image", imagePath)),
  );
  const unsafeLocalImages = new Map<string, string>();
  const imageEntities = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const imageKey = generateSyncKey("image", imagePath);

      try {
        const metadata = await getManagedImageMetadata(imagePath);
        if (!metadata) {
          const reason =
            `Managed image ${imagePath} is still referenced locally, ` +
            `but its metadata could not be read.`;
          console.warn(reason);
          unsafeLocalImages.set(imageKey, reason);
          return null;
        }

        return imageToSyncEntity(
          imagePath,
          metadata.sizeBytes,
          metadata.modifiedAtMs,
        );
      } catch (error) {
        const reason = `Failed to collect managed image sync state for ${imagePath}: ${String(error)}`;
        console.warn(
          `Failed to collect image sync state for ${imagePath}:`,
          error,
        );
        unsafeLocalImages.set(imageKey, reason);
        return null;
      }
    }),
  );

  for (const imageEntity of imageEntities) {
    if (imageEntity) {
      entities.set(imageEntity.key, imageEntity);
    }
  }

  return {
    entities,
    localImageReferences,
    unsafeLocalImages,
  };
}

/**
 * Collects remote state from S3.
 *
 * @param connectionId - S3 connection ID
 * @param bucketName - S3 bucket name
 * @param prefix - Optional prefix for S3 keys
 * @returns Map of key -> SyncEntity
 */
export async function collectRemoteState(
  connectionId: string,
  bucketName: string,
  prefix?: string,
): Promise<Map<string, SyncEntity>> {
  const entities = new Map<string, SyncEntity>();

  const remotePrefixes = ["notes/", "directories/", "images/", "tags/"];
  const objectGroups = await Promise.all(
    remotePrefixes.map((remotePrefix) =>
      listSyncObjects(
        connectionId,
        bucketName,
        prefix ? `${prefix}${remotePrefix}` : remotePrefix,
      ),
    ),
  );

  for (const objects of objectGroups) {
    for (const obj of objects) {
      const entity = s3ObjectToSyncEntity(obj, prefix);
      if (entity) {
        entities.set(entity.key, entity);
      }
    }
  }

  return entities;
}

/**
 * Collects previous sync state from the sync_records table.
 *
 * @param profileId - The sync profile ID
 * @returns Map of key -> SyncEntity
 */
export async function collectPrevSyncState(
  profileId: string,
): Promise<Map<string, SyncEntity>> {
  const entities = new Map<string, SyncEntity>();

  const records = await getSyncRecordsByProfile(profileId);

  for (const record of records) {
    const entity = syncRecordToSyncEntity(record);
    entities.set(entity.key, entity);
  }

  return entities;
}

/**
 * Collects all three states needed for three-way comparison.
 *
 * @param notes - All notes from the database
 * @param directories - All directories from the database
 * @param options - Collection options
 * @returns CollectedState with local, remote, and prevSync maps
 */
export async function collectAllStates(
  notes: Note[],
  directories: Directory[],
  options: CollectOptions,
  tags: Tag[] = [],
): Promise<CollectedState> {
  // Collect all states in parallel where possible
  const [localResult, remote, prevSync] = await Promise.all([
    collectLocalState(notes, directories, tags),
    collectRemoteState(
      options.connectionId,
      options.bucketName,
      options.prefix,
    ),
    collectPrevSyncState(options.profileId),
  ]);

  // Drop legacy directory aliases from prevSync so planning treats the local
  // canonical key and any leftover remote duplicate as a fresh merge pair.
  healDirectorySyncAliases(prevSync);

  return {
    local: localResult.entities,
    remote,
    prevSync,
    localImageReferences: localResult.localImageReferences,
    unsafeLocalImages: localResult.unsafeLocalImages,
  };
}

/**
 * Removes aliased directory prevSync records whose key does not match
 * generateSyncKey("directory", entityId). The executor still reads raw sync
 * records for note remapping; planning then sees a fresh local/remote pair.
 */
export function healDirectorySyncAliases(
  prevSync: Map<string, SyncEntity>,
): void {
  for (const [remoteKey, prev] of [...prevSync]) {
    if (prev.entityType !== "directory") continue;

    const localKey = generateSyncKey("directory", prev.id);
    if (localKey === remoteKey) continue;

    prevSync.delete(remoteKey);
  }
}
