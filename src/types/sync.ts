/**
 * Sync-related TypeScript interfaces for the Three-Way Comparison Model.
 *
 * This module defines all types needed for incremental synchronization,
 * inspired by the Remotely Save plugin's sync algorithm.
 */

// Re-export for convenience
export type { SyncLog, SyncPlanLogSummary } from "@/lib/db/syncLogs";
export type { SyncProfile } from "@/lib/db/syncProfiles";
export type { SyncRecord } from "@/lib/db/syncRecords";

/**
 * Entity types supported by the incremental sync engine.
 */
export type SyncEntityType = "note" | "directory" | "image" | "tag";

/**
 * Represents an entity (note or directory) in a normalized format for sync operations.
 * Contains the essential metadata needed for three-way comparison.
 *
 * For prevSync entities, localMtime and remoteMtime are populated to enable
 * accurate comparison with both local and remote states.
 */
export interface SyncEntity {
  /** Unique identifier of the entity */
  id: string;
  /** Type of the entity */
  entityType: SyncEntityType;
  /** S3 key path (e.g., "notes/{id}.json" or "directories/{id}.json") */
  key: string;
  /** Modification time in milliseconds (Unix timestamp) */
  mtime: number;
  /** Size of the serialized entity in bytes */
  size: number;
  /** Content hash for integrity verification (optional) */
  contentHash?: string;
  /** ETag from S3 (for remote entities) */
  etag?: string;
  /**
   * Local modification time (only for prevSync entities).
   * Stores the entity's updatedAt timestamp at the time of last sync.
   */
  localMtime?: number;
  /**
   * Remote modification time (only for prevSync entities).
   * Stores the S3 LastModified timestamp at the time of last sync.
   */
  remoteMtime?: number;
}

/**
 * Represents a mixed entity combining local, remote, and previous sync states.
 * This is the core data structure for three-way comparison.
 */
export interface MixedEntity {
  /** The canonical key for this entity (e.g., "notes/{id}.json") */
  key: string;
  /** Local state of the entity (from SQLite database) */
  local?: SyncEntity;
  /** Remote state of the entity (from S3) */
  remote?: SyncEntity;
  /** Previous sync state (from sync_records table) */
  prevSync?: SyncEntity;
  /** Whether a managed image is still referenced by local note content. */
  localImageReferenced?: boolean;
  /** Collector-detected issue that makes this entity unsafe to sync automatically. */
  syncIssue?: string;
  /** The sync decision for this entity */
  decision?: SyncDecision;
  /** Decision branch ID for debugging */
  decisionBranch?: number;
  /** Whether this entity requires a change operation */
  change?: boolean;
}

/**
 * All possible sync decisions for an entity.
 * Based on the three-way comparison of local, remote, and prevSync states.
 */
export type SyncDecision =
  // Equal states - no action needed
  | "equal"
  | "only_history"
  // Local changes to push
  | "local_is_created_then_push"
  | "local_is_modified_then_push"
  | "local_is_deleted_thus_also_delete_remote"
  // Remote changes to pull
  | "remote_is_created_then_pull"
  | "remote_is_modified_then_pull"
  | "remote_is_deleted_thus_also_delete_local"
  // Conflict resolutions
  | "conflict_created_then_keep_local"
  | "conflict_created_then_keep_remote"
  | "conflict_modified_then_keep_local"
  | "conflict_modified_then_keep_remote"
  | "conflict_created_then_do_nothing"
  // Directory-specific decisions
  | "folder_existed_both_then_do_nothing"
  | "folder_existed_local_then_also_create_remote"
  | "folder_existed_remote_then_also_create_local"
  | "folder_to_be_created"
  | "folder_to_be_deleted_on_local"
  | "folder_to_be_deleted_on_remote"
  | "folder_to_skip"
  | "unsafe_local_state"
  // Skip decisions
  | "skip"
  | "too_large";

/**
 * Categorized sync plan containing all entities grouped by their required action.
 */
export interface SyncPlan {
  /** Entities that need to be uploaded to S3 */
  uploads: MixedEntity[];
  /** Entities that need to be downloaded from S3 */
  downloads: MixedEntity[];
  /** Entities that need to be deleted locally */
  localDeletes: MixedEntity[];
  /** Entities that need to be deleted from S3 */
  remoteDeletes: MixedEntity[];
  /** Entities that have conflicts requiring resolution */
  conflicts: MixedEntity[];
  /** Entities that are unchanged and need no action */
  unchanged: MixedEntity[];
}

/**
 * Summary of a sync plan for UI display.
 */
export interface SyncPlanSummary {
  /** Total number of entities considered */
  totalItems: number;
  /** Number of entities to upload */
  uploadCount: number;
  /** Number of entities to download */
  downloadCount: number;
  /** Number of entities to delete locally */
  localDeleteCount: number;
  /** Number of entities to delete from S3 */
  remoteDeleteCount: number;
  /** Number of conflicts detected */
  conflictCount: number;
  /** Number of unsafe entities that block sync execution */
  unsafeCount: number;
  /** Number of unchanged entities */
  unchangedCount: number;
}

/**
 * Configuration options for a sync operation.
 */
export interface SyncOptions {
  /** ID of the sync profile to use */
  profileId: string;
  /** Whether to perform a dry run (preview only) */
  dryRun?: boolean;
  /** How to handle conflicts */
  conflictAction: ConflictAction;
  /** Direction of sync */
  syncDirection: SyncDirection;
  /** Abort if deletion percentage exceeds this value (0-100) */
  protectModifyPercentage: number;
  /** Maximum concurrent operations */
  concurrency: number;
}

/**
 * Conflict resolution strategies.
 */
export type ConflictAction =
  | "keep_newer" // Keep the version with the most recent mtime
  | "keep_local" // Always keep local changes
  | "keep_remote" // Always keep remote changes
  | "prompt"; // Ask the user for each conflict

/**
 * Sync direction options.
 */
export type SyncDirection =
  | "bidirectional" // Two-way sync (default)
  | "push_only" // Only upload local changes
  | "pull_only"; // Only download remote changes

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Whether the sync completed successfully */
  success: boolean;
  /** ISO timestamp when the sync started */
  startedAt: string;
  /** ISO timestamp when the sync completed */
  completedAt: string;
  /** Number of entities uploaded */
  uploaded: number;
  /** Number of entities downloaded */
  downloaded: number;
  /** Number of entities deleted (local + remote) */
  deleted: number;
  /** Number of conflicts resolved */
  conflicts: number;
  /** Array of error messages encountered */
  errors: string[];
}

/**
 * Progress information during sync execution.
 */
export interface SyncProgress {
  /** Current phase of the sync operation */
  phase: SyncPhase;
  /** Number of completed operations in the current phase */
  current: number;
  /** Total number of operations in the current phase */
  total: number;
  /** Current item being processed (if applicable) */
  currentItem?: string;
}

/**
 * Phases of a sync operation.
 */
export type SyncPhase =
  | "idle"
  | "connecting"
  | "collecting"
  | "planning"
  | "executing"
  | "directories"
  | "uploading"
  | "downloading"
  | "deleting"
  | "cleanup"
  | "completing";

/**
 * Sync status for the UI.
 */
export interface IncrementalSyncStatus {
  /** Whether a sync operation is in progress */
  isSyncing: boolean;
  /** Current phase of the sync operation */
  phase: SyncPhase;
  /** Progress information */
  progress: SyncProgress | null;
  /** ISO timestamp of the last successful sync */
  lastSyncAt: string | null;
  /** Last error message (if any) */
  lastError: string | null;
  /** ID of the currently active profile */
  activeProfileId: string | null;
}

/**
 * Default sync options.
 */
export const DEFAULT_SYNC_OPTIONS: Omit<SyncOptions, "profileId"> = {
  dryRun: false,
  conflictAction: "keep_newer",
  syncDirection: "bidirectional",
  protectModifyPercentage: 30,
  concurrency: 10,
};

/**
 * S3 key prefix for different entity types.
 */
export const SYNC_KEY_PREFIXES = {
  notes: "notes/",
  directories: "directories/",
  images: "images/",
  tags: "tags/",
} as const;

/** Normalizes image sync keys to forward-slash relative paths. */
export function normalizeImageSyncKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Generates an S3 key for an entity.
 *
 * @param entityType - Type of the entity
 * @param id - Entity ID
 * @returns The S3 key path
 */
export function generateSyncKey(
  entityType: SyncEntityType,
  id: string,
): string {
  if (entityType === "image") {
    return normalizeImageSyncKey(id);
  }

  const prefixMap: Record<string, string> = {
    note: SYNC_KEY_PREFIXES.notes,
    directory: SYNC_KEY_PREFIXES.directories,
    tag: SYNC_KEY_PREFIXES.tags,
  };
  const prefix = prefixMap[entityType];
  return `${prefix}${id}.json`;
}

/**
 * Parses an S3 key to extract entity type and ID.
 *
 * @param key - The S3 key path
 * @returns The parsed entity info or null if invalid
 */
export function parseSyncKey(
  key: string,
): { entityType: SyncEntityType; id: string } | null {
  if (key.startsWith(SYNC_KEY_PREFIXES.notes)) {
    const id = key.slice(SYNC_KEY_PREFIXES.notes.length).replace(".json", "");
    return { entityType: "note", id };
  }
  if (key.startsWith(SYNC_KEY_PREFIXES.directories)) {
    const id = key
      .slice(SYNC_KEY_PREFIXES.directories.length)
      .replace(".json", "");
    return { entityType: "directory", id };
  }
  if (key.startsWith(SYNC_KEY_PREFIXES.tags)) {
    const id = key.slice(SYNC_KEY_PREFIXES.tags.length).replace(".json", "");
    return { entityType: "tag", id };
  }
  if (key.startsWith(SYNC_KEY_PREFIXES.images)) {
    const normalizedKey = normalizeImageSyncKey(key);
    return { entityType: "image", id: normalizedKey };
  }
  return null;
}
