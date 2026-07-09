/**
 * Ensemble module for the Three-Way Comparison Sync Model.
 *
 * Combines local, remote, and prevSync states into MixedEntity objects
 * for decision-making in the planner.
 */

import type { MixedEntity, SyncEntity } from "@/types/sync";
import type { CollectedState } from "./collector";

/**
 * Map of sync keys to MixedEntity objects.
 */
export type MixedEntityMap = Map<string, MixedEntity>;

/**
 * Combines all three states into a unified MixedEntity map.
 *
 * This is the core data structure for three-way comparison:
 * - Each key appears at most once in the map
 * - Each MixedEntity contains optional local, remote, and prevSync states
 * - The planner uses this map to determine sync decisions
 *
 * @param state - Collected states from all three sources
 * @returns Map of key -> MixedEntity
 */
export function ensembleMixedEntities(state: CollectedState): MixedEntityMap {
  const mixedEntities: MixedEntityMap = new Map();
  const localImageReferences = state.localImageReferences ?? new Set<string>();
  const unsafeLocalImages =
    state.unsafeLocalImages ?? new Map<string, string>();

  // Collect all unique keys from all sources in a single Set construction
  const allKeys = new Set<string>([
    ...state.local.keys(),
    ...state.remote.keys(),
    ...state.prevSync.keys(),
    ...localImageReferences,
    ...unsafeLocalImages.keys(),
  ]);

  // Create MixedEntity for each key
  for (const key of allKeys) {
    const local = state.local.get(key);
    const remote = state.remote.get(key);
    const prevSync = state.prevSync.get(key);

    const mixedEntity: MixedEntity = {
      key,
      local,
      remote,
      prevSync,
      localImageReferenced: localImageReferences.has(key),
      syncIssue: unsafeLocalImages.get(key),
    };

    mixedEntities.set(key, mixedEntity);
  }

  return mixedEntities;
}

/**
 * Filters MixedEntity map to only include entities that need action.
 * Entities where local === remote === prevSync are considered unchanged.
 *
 * @param entities - Full MixedEntity map
 * @returns Filtered map with only entities requiring action
 */
export function filterChangedEntities(
  entities: MixedEntityMap,
): MixedEntityMap {
  const changed: MixedEntityMap = new Map();

  for (const [key, entity] of entities) {
    if (entityNeedsAction(entity)) {
      changed.set(key, entity);
    }
  }

  return changed;
}

/**
 * Determines if an entity needs any sync action.
 *
 * @param entity - MixedEntity to check
 * @returns true if the entity needs action
 */
export function entityNeedsAction(entity: MixedEntity): boolean {
  const { local, remote, prevSync } = entity;

  // If all three are undefined, nothing to do
  if (!local && !remote && !prevSync) {
    return false;
  }

  // If only prevSync exists (both local and remote deleted), need cleanup
  if (!local && !remote && prevSync) {
    return true;
  }

  // If local and remote both exist and are identical, no action needed
  if (local && remote) {
    if (entitiesAreEqual(local, remote)) {
      return false;
    }
    return true;
  }

  // One side exists but not the other - needs action
  return true;
}

/**
 * Compares two SyncEntity objects for equality.
 * Uses normalized mtime and size for comparison.
 *
 * @param a - First entity
 * @param b - Second entity
 * @returns true if entities are considered equal
 */
export function entitiesAreEqual(a: SyncEntity, b: SyncEntity): boolean {
  // Must be same entity type
  if (a.entityType !== b.entityType) {
    return false;
  }

  // Compare mtime (normalized to seconds) and size
  if (a.mtime !== b.mtime) {
    return false;
  }

  if (a.size !== b.size) {
    return false;
  }

  return true;
}

/**
 * Compares entity with prevSync to determine if it has changed.
 *
 * @param entity - Current entity state
 * @param prevSync - Previous sync state
 * @returns true if entity equals prevSync
 * @deprecated Use localEqualsPrevSync or remoteEqualsPrevSync for dual-mtime comparison
 */
export function entityEqualsPrevSync(
  entity: SyncEntity | undefined,
  prevSync: SyncEntity | undefined,
): boolean {
  if (!entity && !prevSync) return true;
  if (!entity || !prevSync) return false;
  return entitiesAreEqual(entity, prevSync);
}

/**
 * Compares local entity with prevSync using localMtime.
 *
 * For accurate three-way comparison, we compare local.mtime against
 * prevSync.localMtime (the local mtime at last sync time).
 *
 * Note: We intentionally do NOT compare sizes here because local sizes
 * are estimates (before encryption) while prevSync.size is the actual
 * encrypted size from the last sync. Using mtime alone is sufficient
 * for detecting local changes.
 *
 * @param local - Local entity state
 * @param prevSync - Previous sync state (with localMtime)
 * @returns true if local equals prevSync (no local changes since last sync)
 */
export function localEqualsPrevSync(
  local: SyncEntity | undefined,
  prevSync: SyncEntity | undefined,
): boolean {
  if (!local && !prevSync) return true;
  if (!local || !prevSync) return false;

  // Use prevSync.localMtime for comparison if available, otherwise fall back to mtime
  const prevLocalMtime = prevSync.localMtime ?? prevSync.mtime;

  // Compare entity types
  if (local.entityType !== prevSync.entityType) {
    return false;
  }

  // Compare local mtime with prevSync's recorded local mtime
  if (local.mtime !== prevLocalMtime) {
    return false;
  }

  // Note: Size comparison removed - local size is an estimate, not actual encrypted size
  // mtime comparison is sufficient for detecting local changes

  return true;
}

/**
 * Compares remote entity with prevSync using remoteMtime.
 *
 * For accurate three-way comparison, we compare remote.mtime against
 * prevSync.remoteMtime (the S3 LastModified at last sync time).
 *
 * @param remote - Remote entity state
 * @param prevSync - Previous sync state (with remoteMtime)
 * @returns true if remote equals prevSync (no remote changes since last sync)
 */
export function remoteEqualsPrevSync(
  remote: SyncEntity | undefined,
  prevSync: SyncEntity | undefined,
): boolean {
  if (!remote && !prevSync) return true;
  if (!remote || !prevSync) return false;

  // Use prevSync.remoteMtime for comparison if available, otherwise fall back to mtime
  const prevRemoteMtime = prevSync.remoteMtime ?? prevSync.mtime;

  // Compare entity types
  if (remote.entityType !== prevSync.entityType) {
    return false;
  }

  // Compare remote mtime with prevSync's recorded remote mtime
  if (remote.mtime !== prevRemoteMtime) {
    return false;
  }

  // Compare size
  if (remote.size !== prevSync.size) {
    return false;
  }

  return true;
}

/**
 * Groups MixedEntities by entity type.
 *
 * @param entities - MixedEntity map
 * @returns Object with notes and directories arrays
 */
export function groupByEntityType(entities: MixedEntityMap): {
  notes: MixedEntity[];
  directories: MixedEntity[];
  images: MixedEntity[];
} {
  const notes: MixedEntity[] = [];
  const directories: MixedEntity[] = [];
  const images: MixedEntity[] = [];

  for (const entity of entities.values()) {
    // Determine type from whichever source is available
    const entityType =
      entity.local?.entityType ||
      entity.remote?.entityType ||
      entity.prevSync?.entityType;

    if (entityType === "note") {
      notes.push(entity);
    } else if (entityType === "directory") {
      directories.push(entity);
    } else if (entityType === "image") {
      images.push(entity);
    }
  }

  return { notes, directories, images };
}

/**
 * Counts entities by state presence.
 *
 * @param entities - MixedEntity map
 * @returns Statistics about entity states
 */
export function getEntityStats(entities: MixedEntityMap): {
  total: number;
  localOnly: number;
  remoteOnly: number;
  both: number;
  prevSyncOnly: number;
} {
  let localOnly = 0;
  let remoteOnly = 0;
  let both = 0;
  let prevSyncOnly = 0;

  for (const entity of entities.values()) {
    const hasLocal = !!entity.local;
    const hasRemote = !!entity.remote;
    const hasPrevSync = !!entity.prevSync;

    if (hasLocal && hasRemote) {
      both++;
    } else if (hasLocal && !hasRemote) {
      localOnly++;
    } else if (!hasLocal && hasRemote) {
      remoteOnly++;
    } else if (!hasLocal && !hasRemote && hasPrevSync) {
      prevSyncOnly++;
    }
  }

  return {
    total: entities.size,
    localOnly,
    remoteOnly,
    both,
    prevSyncOnly,
  };
}
