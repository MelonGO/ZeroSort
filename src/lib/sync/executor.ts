/**
 * Sync Executor for the Three-Way Comparison Model.
 *
 * Executes the sync plan with proper ordering and concurrency control:
 * 1. Directories (creation) - shallow to deep
 * 2. Uploads/Downloads - parallel with concurrency limit
 * 3. Deletions - deep to shallow
 * 4. PrevSync update - after successful operations
 */

import {
  deleteDirectoryFromDb,
  getDirectoryById,
  getDirectoryByNameAndParent,
  saveDirectory,
} from "@/lib/db/directories";
import { rebuildLinksForNote } from "@/lib/db/noteLinks";
import {
  deleteNoteFromDb,
  getNoteByIdWithContent,
  saveNote,
} from "@/lib/db/notes";
import {
  deleteSyncRecord,
  deleteSyncRecordsByEntityIds,
  getSyncRecordsByProfile,
  upsertSyncRecord,
} from "@/lib/db/syncRecords";
import { deleteTagFromDb, getTagById, saveTag } from "@/lib/db/tags";
import {
  deleteManagedImageFile,
  getManagedImageMetadata,
  readManagedImageFile,
  writeManagedImageFile,
} from "@/lib/images";
import type { Directory } from "@/types";
import type {
  MixedEntity,
  SyncEntityType,
  SyncPhase,
  SyncPlan,
  SyncProgress,
  SyncResult,
} from "@/types/sync";
import { generateSyncKey, parseSyncKey } from "@/types/sync";
import {
  decryptSyncBytes,
  encryptSyncBytes,
  getEncryptedSyncByteSize,
} from "./encryption";
import {
  deleteSyncObjectsBatch,
  downloadSyncBinaryObject,
  downloadSyncObject,
  uploadSyncBinaryObject,
  uploadSyncObject,
} from "./s3";
import {
  deserializeDirectory,
  deserializeNote,
  deserializeTag,
  getStringByteSize,
  normalizeMtime,
  parseS3Timestamp,
  serializeDirectory,
  serializeNote,
  serializeTag,
} from "./utils";

const MAX_SYNC_BINARY_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Options for executing a sync plan.
 */
export interface ExecutorOptions {
  /** S3 connection ID */
  connectionId: string;
  /** S3 bucket name */
  bucketName: string;
  /** Sync profile ID for updating sync records */
  profileId: string;
  /** Optional prefix for S3 keys */
  prefix?: string;
  /** Maximum concurrent operations (default: 10) */
  concurrency?: number;
  /** Whether this is a dry run (preview only) */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (progress: SyncProgress) => void;
  /** Encryption password for E2E encryption of note/directory content */
  encryptionPassword: string;
}

/**
 * Simple concurrency limiter for parallel operations.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

/**
 * Executes a sync plan.
 *
 * Follows the execution order:
 * 1. Create directories (shallow to deep)
 * 2. Upload/download entities (parallel)
 * 3. Delete entities (deep to shallow)
 * 4. Update sync records
 *
 * @param plan - The sync plan to execute
 * @param options - Execution options
 * @returns Sync result with statistics
 */
export async function executeSyncPlan(
  plan: SyncPlan,
  options: ExecutorOptions,
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const concurrency = options.concurrency ?? 10;
  const limiter = new ConcurrencyLimiter(concurrency);

  let uploaded = 0;
  let downloaded = 0;
  let deleted = 0;
  let conflicts = 0;

  const reportProgress = (
    phase: SyncPhase,
    current: number,
    total: number,
    item?: string,
  ) => {
    options.onProgress?.({
      phase,
      current,
      total,
      currentItem: item,
    });
  };

  try {
    const safetyErrors = validateSyncExecutionSafety(plan);
    if (safetyErrors.length > 0) {
      throw new Error(safetyErrors.join("; "));
    }

    if (options.dryRun) {
      return {
        success: true,
        startedAt,
        completedAt: new Date().toISOString(),
        uploaded: plan.uploads.length,
        downloaded: plan.downloads.length,
        deleted: plan.localDeletes.length + plan.remoteDeletes.length,
        conflicts: countConflicts(plan),
        errors: [],
      };
    }

    // Phase 1: Handle directory and tag operations first.
    // Tags are grouped here so note downloads never reference tags that do not exist locally yet.
    // Single-pass categorization instead of multiple filter() calls.
    const uploadCategories = categorizeEntities(plan.uploads);
    const downloadCategories = categorizeEntities(plan.downloads);

    const dirUploads = uploadCategories.directories;
    const dirDownloads = downloadCategories.directories;
    const tagUploads = uploadCategories.tags;
    const tagDownloads = downloadCategories.tags;
    const directoryPhaseTotal =
      dirUploads.length +
      dirDownloads.length +
      tagUploads.length +
      tagDownloads.length;

    reportProgress("directories", 0, directoryPhaseTotal);

    // Seed remaps from prior collision aliases, then prefetch downloads so we can
    // skip same-run uploads that will merge onto an existing remote folder.
    const directoryIdRemap = await buildPersistedDirectoryIdRemap(
      options.profileId,
    );
    const duplicateRemoteDirectoryKeys = new Set<string>();
    const orderedDirDownloads = await orderDirectoryDownloadsParentFirst(
      dirDownloads,
      options,
    );
    const mergeTargetLocalIds = await collectDirectoryMergeTargets(
      orderedDirDownloads,
      options,
      directoryIdRemap,
    );

    // Upload directories, skipping locals that will merge with a remote download.
    let directoryPhaseProgress = 0;
    const dirUploadsToRun = dirUploads.filter((entity) => {
      const localId = entity.local?.id;
      return !localId || !mergeTargetLocalIds.has(localId);
    });
    const skippedDirUploads = dirUploads.length - dirUploadsToRun.length;
    directoryPhaseProgress += skippedDirUploads;
    if (skippedDirUploads > 0) {
      reportProgress("directories", directoryPhaseProgress, directoryPhaseTotal);
    }

    const dirUploadPromises = dirUploadsToRun.map((entity) =>
      limiter.run(async () => {
        try {
          await executeUpload(entity, options);
          uploaded++;
          directoryPhaseProgress++;
          reportProgress(
            "directories",
            directoryPhaseProgress,
            directoryPhaseTotal,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to upload directory ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(dirUploadPromises);

    // Download directories parent-first, merging same-name siblings onto local IDs.
    for (const entity of orderedDirDownloads) {
      try {
        await executeDownload(
          entity,
          options,
          directoryIdRemap,
          duplicateRemoteDirectoryKeys,
        );
        downloaded++;
        directoryPhaseProgress++;
        reportProgress(
          "directories",
          directoryPhaseProgress,
          directoryPhaseTotal,
          entity.key,
        );
      } catch (error) {
        errors.push(`Failed to download directory ${entity.key}: ${error}`);
      }
    }

    // Upload tags (parallel with concurrency limit)
    const tagUploadPromises = tagUploads.map((entity) =>
      limiter.run(async () => {
        try {
          await executeUpload(entity, options);
          uploaded++;
          directoryPhaseProgress++;
          reportProgress(
            "directories",
            directoryPhaseProgress,
            directoryPhaseTotal,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to upload tag ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(tagUploadPromises);

    // Download tags (parallel with concurrency limit)
    const tagDownloadPromises = tagDownloads.map((entity) =>
      limiter.run(async () => {
        try {
          await executeDownload(entity, options);
          downloaded++;
          directoryPhaseProgress++;
          reportProgress(
            "directories",
            directoryPhaseProgress,
            directoryPhaseTotal,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to download tag ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(tagDownloadPromises);

    // Phase 2: Upload notes (parallel)
    const noteUploads = uploadCategories.notes;
    const imageUploads = uploadCategories.images;
    const totalUploadOperations = noteUploads.length + imageUploads.length;
    reportProgress("uploading", 0, totalUploadOperations);
    let uploadProgress = 0;

    const uploadPromises = noteUploads.map((entity) =>
      limiter.run(async () => {
        try {
          await executeUpload(entity, options);
          uploaded++;
          if (entity.decision?.includes("conflict")) conflicts++;
          uploadProgress++;
          reportProgress(
            "uploading",
            uploadProgress,
            totalUploadOperations,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to upload ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(uploadPromises);

    // Phase 3: Upload images (parallel)

    const imageUploadPromises = imageUploads.map((entity) =>
      limiter.run(async () => {
        try {
          await executeUpload(entity, options);
          uploaded++;
          if (entity.decision?.includes("conflict")) conflicts++;
          uploadProgress++;
          reportProgress(
            "uploading",
            uploadProgress,
            totalUploadOperations,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to upload ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(imageUploadPromises);

    // Phase 4: Download notes and images (parallel)
    const noteDownloads = downloadCategories.notes;
    const imageDownloads = downloadCategories.images;
    const totalDownloadOperations =
      noteDownloads.length + imageDownloads.length;
    reportProgress("downloading", 0, totalDownloadOperations);
    let downloadProgress = 0;

    // Collect downloaded note info for deferred link rebuilding
    const downloadedNotes: DownloadedNoteInfo[] = [];

    const downloadPromises = noteDownloads.map((entity) =>
      limiter.run(async () => {
        try {
          const noteInfo = await executeDownload(
            entity,
            options,
            directoryIdRemap,
          );
          downloaded++;
          if (noteInfo) downloadedNotes.push(noteInfo);
          if (entity.decision?.includes("conflict")) conflicts++;
          downloadProgress++;
          reportProgress(
            "downloading",
            downloadProgress,
            totalDownloadOperations,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to download ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(downloadPromises);

    const imageDownloadPromises = imageDownloads.map((entity) =>
      limiter.run(async () => {
        try {
          await executeDownload(entity, options);
          downloaded++;
          if (entity.decision?.includes("conflict")) conflicts++;
          downloadProgress++;
          reportProgress(
            "downloading",
            downloadProgress,
            totalDownloadOperations,
            entity.key,
          );
        } catch (error) {
          errors.push(`Failed to download ${entity.key}: ${error}`);
        }
      }),
    );

    await Promise.all(imageDownloadPromises);

    // Phase 4b: Rebuild note links after all notes are saved locally.
    // This ensures wiki-link resolution can find every downloaded note,
    // avoiding broken links when notes reference each other.
    if (downloadedNotes.length > 0) {
      for (const { noteId, content } of downloadedNotes) {
        try {
          await rebuildLinksForNote(noteId, content);
        } catch (error) {
          console.warn(
            `[Sync] Failed to rebuild note links for downloaded note ${noteId}:`,
            error,
          );
        }
      }
    }

    // Phase 5: Delete local entities
    reportProgress(
      "deleting",
      0,
      plan.localDeletes.length + plan.remoteDeletes.length,
    );

    // Sort by depth descending for deletions (deep first)
    const sortedLocalDeletes = [...plan.localDeletes].sort(
      (a, b) => b.key.length - a.key.length,
    );

    for (let i = 0; i < sortedLocalDeletes.length; i++) {
      const entity = sortedLocalDeletes[i];
      try {
        await executeLocalDelete(entity, options);
        deleted++;
        reportProgress(
          "deleting",
          i + 1,
          plan.localDeletes.length + plan.remoteDeletes.length,
          entity.key,
        );
      } catch (error) {
        errors.push(`Failed to delete local ${entity.key}: ${error}`);
      }
    }

    // Phase 6: Delete remote entities (batch), including duplicate remote
    // directory objects left behind by same-name collision merges.
    const remoteDeletes = [
      ...plan.remoteDeletes,
      ...[...duplicateRemoteDirectoryKeys].map((key) => ({ key })),
    ];

    if (remoteDeletes.length > 0) {
      try {
        const keys = remoteDeletes.map((e) => {
          const prefix = options.prefix ?? "";
          return prefix + e.key;
        });

        const deleteResult = await deleteSyncObjectsBatch(
          options.connectionId,
          options.bucketName,
          keys,
        );

        const deletedKeys = new Set(deleteResult.deleted_keys);
        const failedKeys = new Set(deleteResult.failed_keys);

        for (const key of keys) {
          if (!deletedKeys.has(key) && !failedKeys.has(key)) {
            failedKeys.add(key);
          }
        }

        deleted += deleteResult.deleted_keys.length;

        // Update sync records for planned remote deletes only (not collision cleanup).
        const entityIds = plan.remoteDeletes
          .filter((entity) =>
            deletedKeys.has((options.prefix ?? "") + entity.key),
          )
          .map((e) => e.local?.id || e.prevSync?.id)
          .filter((id): id is string => !!id);

        if (entityIds.length > 0) {
          await deleteSyncRecordsByEntityIds(entityIds, options.profileId);
        }

        if (failedKeys.size > 0) {
          const failureDetails =
            deleteResult.errors.length > 0
              ? deleteResult.errors.join("; ")
              : Array.from(failedKeys).join(", ");

          throw new Error(
            `Remote delete incomplete for ${failedKeys.size} objects: ${failureDetails}`,
          );
        }

        reportProgress(
          "deleting",
          plan.localDeletes.length + plan.remoteDeletes.length,
          plan.localDeletes.length + plan.remoteDeletes.length,
        );
      } catch (error) {
        errors.push(`Failed to batch delete remote objects: ${error}`);
      }
    }

    // Phase 7: Cleanup - update sync records for unchanged items
    reportProgress("cleanup", 0, plan.unchanged.length);

    // No action needed for unchanged - they're already in sync

    reportProgress("completing", 0, 1);

    return {
      success: errors.length === 0,
      startedAt,
      completedAt: new Date().toISOString(),
      uploaded,
      downloaded,
      deleted,
      conflicts,
      errors,
    };
  } catch (error) {
    errors.push(`Sync execution failed: ${error}`);
    return {
      success: false,
      startedAt,
      completedAt: new Date().toISOString(),
      uploaded,
      downloaded,
      deleted,
      conflicts,
      errors,
    };
  }
}

/**
 * Executes an upload operation for an entity.
 */
async function executeUpload(
  entity: MixedEntity,
  options: ExecutorOptions,
): Promise<void> {
  const { local } = entity;
  if (!local) {
    throw new Error(`Cannot upload entity without local state: ${entity.key}`);
  }

  // Get the full entity data from the database
  let size: number;
  const localMtime = local.mtime;
  let uploadResult: { etag: string; last_modified: string };

  if (local.entityType === "note") {
    const note = await getNoteByIdWithContent(local.id);
    if (!note) {
      throw new Error(`Note not found: ${local.id}`);
    }
    const jsonContent = await serializeNote(note, options.encryptionPassword);
    size = getStringByteSize(jsonContent);
    uploadResult = await uploadSyncObject(
      options.connectionId,
      options.bucketName,
      (options.prefix ?? "") + entity.key,
      jsonContent,
    );
  } else if (local.entityType === "directory") {
    const dir = await getDirectoryById(local.id);
    if (!dir) {
      throw new Error(`Directory not found: ${local.id}`);
    }
    const jsonContent = await serializeDirectory(
      dir,
      options.encryptionPassword,
    );
    size = getStringByteSize(jsonContent);
    uploadResult = await uploadSyncObject(
      options.connectionId,
      options.bucketName,
      (options.prefix ?? "") + entity.key,
      jsonContent,
    );
  } else if (local.entityType === "tag") {
    const tag = await getTagById(local.id);
    if (!tag) {
      throw new Error(`Tag not found: ${local.id}`);
    }
    const jsonContent = await serializeTag(tag, options.encryptionPassword);
    size = getStringByteSize(jsonContent);
    uploadResult = await uploadSyncObject(
      options.connectionId,
      options.bucketName,
      (options.prefix ?? "") + entity.key,
      jsonContent,
    );
  } else {
    const metadata = await getManagedImageMetadata(local.id);
    if (!metadata) {
      throw new Error(`Managed image not found: ${local.id}`);
    }

    const encryptedSize = getEncryptedSyncByteSize(metadata.sizeBytes);
    if (encryptedSize > MAX_SYNC_BINARY_UPLOAD_BYTES) {
      throw new Error(
        `Managed image is too large to sync: ${encryptedSize} bytes exceeds the ${MAX_SYNC_BINARY_UPLOAD_BYTES} byte upload limit`,
      );
    }

    const imageBytes = await readManagedImageFile(local.id);
    const encryptedBytes = await encryptSyncBytes(
      imageBytes,
      options.encryptionPassword,
    );
    size = encryptedBytes.byteLength;
    uploadResult = await uploadSyncBinaryObject(
      options.connectionId,
      options.bucketName,
      (options.prefix ?? "") + entity.key,
      encryptedBytes,
    );
  }

  // Get S3's LastModified timestamp for remote mtime
  const remoteMtime = normalizeMtime(
    parseS3Timestamp(uploadResult.last_modified),
  );

  // Update sync record with dual mtime (local and remote)
  await upsertSyncRecord({
    entityId: local.id,
    entityType: local.entityType,
    key: entity.key,
    localMtime,
    remoteMtime,
    size,
    etag: uploadResult.etag,
    syncedAt: new Date().toISOString(),
    profileId: options.profileId,
  });
}

/** Info collected from a downloaded note for deferred link rebuilding. */
interface DownloadedNoteInfo {
  noteId: string;
  content: string;
}

/**
 * Executes a download operation for an entity.
 * Returns note info when a note is downloaded so links can be rebuilt after all notes are saved.
 *
 * @param directoryIdRemap - Optional remote→local directory ID map for path collisions
 * @param duplicateRemoteDirectoryKeys - Optional set collecting remote keys to delete after merge
 */
async function executeDownload(
  entity: MixedEntity,
  options: ExecutorOptions,
  directoryIdRemap?: Map<string, string>,
  duplicateRemoteDirectoryKeys?: Set<string>,
): Promise<DownloadedNoteInfo | undefined> {
  const { remote } = entity;
  if (!remote) {
    throw new Error(
      `Cannot download entity without remote state: ${entity.key}`,
    );
  }

  // Download from S3
  const key = (options.prefix ?? "") + entity.key;
  // Parse and save to database, capturing the local mtime from the downloaded content
  let localMtime: number;
  let downloadedNoteInfo: DownloadedNoteInfo | undefined;
  /** Entity ID written to sync_records (may differ from remote.id after folder merge). */
  let syncEntityId = remote.id;
  /** Sync key written to sync_records (local canonical key after folder merge). */
  let syncKey = entity.key;
  let syncSize = remote.size;
  let syncEtag = remote.etag;
  let syncRemoteMtime = remote.mtime;

  if (remote.entityType === "note") {
    const jsonContent = await downloadSyncObject(
      options.connectionId,
      options.bucketName,
      key,
    );
    const note = await deserializeNote(jsonContent, options.encryptionPassword);
    if (note.directoryId && directoryIdRemap?.has(note.directoryId)) {
      note.directoryId = directoryIdRemap.get(note.directoryId)!;
    }
    await saveNote(note);
    // Get local mtime from the downloaded note's updatedAt (or createdAt as fallback)
    localMtime = normalizeMtime(
      new Date(note.updatedAt ?? note.createdAt).getTime(),
    );

    // Collect note info — link rebuilding is deferred until all notes are saved
    downloadedNoteInfo = { noteId: note.id, content: note.content || "" };
  } else if (remote.entityType === "directory") {
    const jsonContent = await downloadDirectoryPayload(entity, options);
    const dir = await deserializeDirectory(
      jsonContent,
      options.encryptionPassword,
    );
    const resolved = await resolveDownloadedDirectory(
      dir,
      directoryIdRemap ?? new Map(),
      remote,
    );
    syncEntityId = resolved.localId;
    syncKey = resolved.canonicalKey;
    localMtime = normalizeMtime(
      resolved.updatedAt ? new Date(resolved.updatedAt).getTime() : Date.now(),
    );

    if (resolved.duplicateRemoteKey) {
      duplicateRemoteDirectoryKeys?.add(resolved.duplicateRemoteKey);

      // Publish the merged folder under the local canonical key, then the
      // duplicate remote key is removed in the remote-delete phase.
      const localDir = await getDirectoryById(resolved.localId);
      if (localDir) {
        const canonicalContent = await serializeDirectory(
          localDir,
          options.encryptionPassword,
        );
        const uploadResult = await uploadSyncObject(
          options.connectionId,
          options.bucketName,
          (options.prefix ?? "") + resolved.canonicalKey,
          canonicalContent,
        );
        syncSize = getStringByteSize(canonicalContent);
        syncEtag = uploadResult.etag;
        syncRemoteMtime = normalizeMtime(
          parseS3Timestamp(uploadResult.last_modified),
        );
      } else {
        syncSize = remote.size;
        syncEtag = remote.etag;
        syncRemoteMtime = remote.mtime;
      }
    }
  } else if (remote.entityType === "tag") {
    const jsonContent = await downloadSyncObject(
      options.connectionId,
      options.bucketName,
      key,
    );
    const tag = await deserializeTag(jsonContent, options.encryptionPassword);
    await saveTag(tag);
    localMtime = normalizeMtime(
      tag.updatedAt ? new Date(tag.updatedAt).getTime() : Date.now(),
    );
  } else {
    const encryptedBytes = await downloadSyncBinaryObject(
      options.connectionId,
      options.bucketName,
      key,
    );
    const imageBytes = await decryptSyncBytes(
      encryptedBytes,
      options.encryptionPassword,
    );
    const metadata = await writeManagedImageFile(remote.id, imageBytes);
    localMtime = normalizeMtime(metadata.modifiedAtMs);
  }

  // Update sync record with dual mtime (local and remote).
  // For collided directories, entityId and key both use the local canonical identity.
  await upsertSyncRecord({
    entityId: syncEntityId,
    entityType: remote.entityType,
    key: syncKey,
    localMtime,
    remoteMtime: syncRemoteMtime,
    size: syncSize,
    etag: syncEtag,
    syncedAt: new Date().toISOString(),
    profileId: options.profileId,
  });

  return downloadedNoteInfo;
}

/**
 * Builds a remote→local directory ID remap from persisted sync-record aliases
 * (records whose key does not match generateSyncKey("directory", entityId)).
 */
async function buildPersistedDirectoryIdRemap(
  profileId: string,
): Promise<Map<string, string>> {
  const remap = new Map<string, string>();
  const records = await getSyncRecordsByProfile(profileId);

  for (const record of records) {
    if (record.entityType !== "directory") continue;

    const expectedKey = generateSyncKey("directory", record.entityId);
    if (record.key === expectedKey) continue;

    const parsed = parseSyncKey(record.key);
    if (!parsed || parsed.entityType !== "directory") continue;

    remap.set(parsed.id, record.entityId);
  }

  return remap;
}

/**
 * Identifies local directory IDs that will merge with a same-name remote download
 * in this run, so their uploads can be skipped.
 */
async function collectDirectoryMergeTargets(
  orderedDirDownloads: MixedEntity[],
  options: ExecutorOptions,
  directoryIdRemap: Map<string, string>,
): Promise<Set<string>> {
  const mergeTargets = new Set<string>();

  for (const entity of orderedDirDownloads) {
    if (!entity.remote) continue;

    try {
      const jsonContent = await downloadDirectoryPayload(entity, options);
      // Re-cache so executeDownload can reuse the payload.
      prefetchedDirectoryPayloads.set(entity.key, jsonContent);

      const dir = await deserializeDirectory(
        jsonContent,
        options.encryptionPassword,
      );
      const remappedParentId =
        dir.parentId && directoryIdRemap.has(dir.parentId)
          ? directoryIdRemap.get(dir.parentId)!
          : dir.parentId;

      const existing = await getDirectoryByNameAndParent(
        dir.name,
        remappedParentId,
      );
      if (existing && existing.id !== dir.id) {
        mergeTargets.add(existing.id);
        directoryIdRemap.set(dir.id, existing.id);
      }
    } catch {
      // Best-effort: if prefetch fails, upload proceeds normally.
    }
  }

  return mergeTargets;
}

/**
 * Resolves a downloaded directory against local sibling uniqueness, remapping
 * remote IDs onto existing local folders when names collide under the same parent.
 * Canonicalizes on the local directory key after a merge.
 */
async function resolveDownloadedDirectory(
  dir: Directory,
  directoryIdRemap: Map<string, string>,
  remote: { key: string; mtime: number; size: number; etag?: string },
): Promise<{
  localId: string;
  canonicalKey: string;
  duplicateRemoteKey?: string;
  updatedAt?: string;
}> {
  const remappedParentId =
    dir.parentId && directoryIdRemap.has(dir.parentId)
      ? directoryIdRemap.get(dir.parentId)!
      : dir.parentId;

  const existing = await getDirectoryByNameAndParent(
    dir.name,
    remappedParentId,
  );

  if (existing && existing.id !== dir.id) {
    directoryIdRemap.set(dir.id, existing.id);
    const canonicalKey = generateSyncKey("directory", existing.id);
    const duplicateRemoteKey =
      remote.key !== canonicalKey ? remote.key : undefined;

    return {
      localId: existing.id,
      canonicalKey,
      duplicateRemoteKey,
      updatedAt: existing.updatedAt,
    };
  }

  const toSave: Directory = {
    ...dir,
    parentId: remappedParentId,
  };
  await saveDirectory(toSave);

  return {
    localId: dir.id,
    canonicalKey: generateSyncKey("directory", dir.id),
    updatedAt: dir.updatedAt,
  };
}

/**
 * Orders directory downloads so parents are processed before children.
 * Uses downloaded payloads when available; falls back to key order otherwise.
 */
async function orderDirectoryDownloadsParentFirst(
  dirDownloads: MixedEntity[],
  options: ExecutorOptions,
): Promise<MixedEntity[]> {
  prefetchedDirectoryPayloads.clear();

  if (dirDownloads.length <= 1) {
    if (dirDownloads.length === 1) {
      // Still prefetch a single download so merge-target detection can reuse it.
      const entity = dirDownloads[0];
      if (entity.remote) {
        try {
          const key = (options.prefix ?? "") + entity.key;
          const jsonContent = await downloadSyncObject(
            options.connectionId,
            options.bucketName,
            key,
          );
          prefetchedDirectoryPayloads.set(entity.key, jsonContent);
        } catch {
          // Fall through; executeDownload will fetch again.
        }
      }
    }
    return dirDownloads;
  }

  // Prefetch directory payloads to learn parent relationships for topological sort.
  const parentByRemoteId = new Map<string, string | null>();
  const payloadByKey = new Map<string, string>();

  await Promise.all(
    dirDownloads.map(async (entity) => {
      if (!entity.remote) return;
      const key = (options.prefix ?? "") + entity.key;
      try {
        const jsonContent = await downloadSyncObject(
          options.connectionId,
          options.bucketName,
          key,
        );
        payloadByKey.set(entity.key, jsonContent);
        const dir = await deserializeDirectory(
          jsonContent,
          options.encryptionPassword,
        );
        parentByRemoteId.set(dir.id, dir.parentId ?? null);
      } catch {
        // Sorting falls back to original order for failed prefetches.
      }
    }),
  );

  // Cache prefetched payloads so executeDownload can reuse them via a module map.
  for (const [entityKey, payload] of payloadByKey) {
    prefetchedDirectoryPayloads.set(entityKey, payload);
  }

  const remoteIds = new Set(
    dirDownloads
      .map((entity) => entity.remote?.id)
      .filter((id): id is string => !!id),
  );

  const sorted: MixedEntity[] = [];
  const remaining = [...dirDownloads];
  const placed = new Set<string>();

  while (remaining.length > 0) {
    let progressed = false;

    for (let i = 0; i < remaining.length; i++) {
      const entity = remaining[i];
      const remoteId = entity.remote?.id;
      if (!remoteId) {
        sorted.push(entity);
        remaining.splice(i, 1);
        progressed = true;
        break;
      }

      const parentId = parentByRemoteId.get(remoteId) ?? null;
      const parentReady =
        parentId === null ||
        !remoteIds.has(parentId) ||
        placed.has(parentId);

      if (parentReady) {
        sorted.push(entity);
        remaining.splice(i, 1);
        placed.add(remoteId);
        progressed = true;
        break;
      }
    }

    if (!progressed) {
      // Cycle or missing parent metadata — append the rest as-is.
      sorted.push(...remaining);
      break;
    }
  }

  return sorted;
}

/** Prefetched directory JSON keyed by sync entity key (cleared after use). */
const prefetchedDirectoryPayloads = new Map<string, string>();

/**
 * Downloads directory JSON, preferring a payload prefetched during parent-first sort.
 */
async function downloadDirectoryPayload(
  entity: MixedEntity,
  options: ExecutorOptions,
): Promise<string> {
  const cached = prefetchedDirectoryPayloads.get(entity.key);
  if (cached !== undefined) {
    prefetchedDirectoryPayloads.delete(entity.key);
    return cached;
  }

  const key = (options.prefix ?? "") + entity.key;
  return downloadSyncObject(
    options.connectionId,
    options.bucketName,
    key,
  );
}

/**
 * Executes a local delete operation for an entity.
 */
async function executeLocalDelete(
  entity: MixedEntity,
  options: ExecutorOptions,
): Promise<void> {
  const entityId = entity.local?.id || entity.prevSync?.id;
  const entityType = entity.local?.entityType || entity.prevSync?.entityType;

  if (!entityId || !entityType) {
    throw new Error(`Cannot delete entity without ID: ${entity.key}`);
  }

  // Delete from the appropriate local store
  if (entityType === "note") {
    await deleteNoteFromDb(entityId);
  } else if (entityType === "directory") {
    await deleteDirectoryFromDb(entityId);
  } else if (entityType === "tag") {
    await deleteTagFromDb(entityId);
  } else {
    await deleteManagedImageFile(entityId);
  }

  // Delete sync record
  await deleteSyncRecord(entityId, options.profileId);
}

/** Categorizes entities into directory, tag, note, and image buckets in a single pass. */
function categorizeEntities(entities: MixedEntity[]): {
  directories: MixedEntity[];
  tags: MixedEntity[];
  notes: MixedEntity[];
  images: MixedEntity[];
} {
  const directories: MixedEntity[] = [];
  const tags: MixedEntity[] = [];
  const notes: MixedEntity[] = [];
  const images: MixedEntity[] = [];

  for (const entity of entities) {
    if (isDirectory(entity)) {
      directories.push(entity);
    } else if (isTag(entity)) {
      tags.push(entity);
    } else if (isImage(entity)) {
      images.push(entity);
    } else {
      notes.push(entity);
    }
  }

  return { directories, tags, notes, images };
}

/**
 * Checks if an entity is a directory.
 */
function isDirectory(entity: MixedEntity): boolean {
  return (
    entity.local?.entityType === "directory" ||
    entity.remote?.entityType === "directory" ||
    entity.prevSync?.entityType === "directory"
  );
}

/**
 * Checks if an entity is a tag.
 */
function isTag(entity: MixedEntity): boolean {
  return (
    entity.local?.entityType === "tag" ||
    entity.remote?.entityType === "tag" ||
    entity.prevSync?.entityType === "tag"
  );
}

/**
 * Checks if an entity is a managed image.
 */
function isImage(entity: MixedEntity): boolean {
  return (
    entity.local?.entityType === "image" ||
    entity.remote?.entityType === "image" ||
    entity.prevSync?.entityType === "image"
  );
}

/**
 * Counts the number of conflicts in a sync plan.
 */
function countConflicts(plan: SyncPlan): number {
  let count = 0;
  for (const entity of [...plan.uploads, ...plan.downloads]) {
    if (entity.decision?.includes("conflict")) {
      count++;
    }
  }
  return count;
}

/**
 * Validates that prerequisites are met before executing.
 *
 * @param options - Executor options
 * @returns Array of validation errors, empty if valid
 */
export function validateExecutorOptions(options: ExecutorOptions): string[] {
  const errors: string[] = [];

  if (!options.connectionId) {
    errors.push("Connection ID is required");
  }
  if (!options.bucketName) {
    errors.push("Bucket name is required");
  }
  if (!options.profileId) {
    errors.push("Profile ID is required");
  }
  if (
    options.concurrency &&
    (options.concurrency < 1 || options.concurrency > 50)
  ) {
    errors.push("Concurrency must be between 1 and 50");
  }

  return errors;
}

/**
 * Gets the entity ID from a MixedEntity.
 */
export function getEntityId(entity: MixedEntity): string | undefined {
  return entity.local?.id || entity.remote?.id || entity.prevSync?.id;
}

/**
 * Gets the entity type from a MixedEntity.
 */
export function getEntityType(entity: MixedEntity): SyncEntityType | undefined {
  return (
    entity.local?.entityType ||
    entity.remote?.entityType ||
    entity.prevSync?.entityType
  );
}

/** Validates that the execution plan does not contain unsafe managed-image operations. */
export function validateSyncExecutionSafety(plan: SyncPlan): string[] {
  const errors: string[] = [];
  const allEntities = [
    ...plan.uploads,
    ...plan.downloads,
    ...plan.localDeletes,
    ...plan.remoteDeletes,
    ...plan.conflicts,
  ];

  for (const entity of allEntities) {
    if (entity.decision === "unsafe_local_state" || entity.syncIssue) {
      errors.push(entity.syncIssue ?? `Unsafe sync state for ${entity.key}`);
    }
  }

  for (const entity of plan.remoteDeletes) {
    if (!isImage(entity)) {
      continue;
    }

    if (entity.localImageReferenced !== false) {
      errors.push(
        `Refusing to delete remote image ${entity.key} because it is still referenced locally or its local reference state is unknown.`,
      );
    }
  }

  return errors;
}
