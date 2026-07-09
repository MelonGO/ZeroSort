/**
 * Sync Planner for the Three-Way Comparison Model.
 *
 * Implements the decision matrix that determines what action to take
 * for each entity based on local, remote, and prevSync states.
 *
 * Based on the Remotely Save plugin's sync algorithm.
 */

import type {
  MixedEntity,
  SyncOptions,
  SyncPlan,
  SyncPlanSummary,
} from "@/types/sync";
import type { MixedEntityMap } from "./ensemble";
import {
  entitiesAreEqual,
  localEqualsPrevSync,
  remoteEqualsPrevSync,
} from "./ensemble";

/**
 * Generates a sync plan by analyzing all MixedEntities.
 *
 * This is the core decision engine that implements three-way comparison:
 * - Compares local, remote, and prevSync states
 * - Assigns a decision to each entity
 * - Groups entities by required action
 *
 * @param entities - MixedEntity map from ensemble
 * @param options - Sync options including conflict resolution strategy
 * @returns SyncPlan with categorized actions
 */
export function generateSyncPlan(
  entities: MixedEntityMap,
  options: Pick<SyncOptions, "conflictAction" | "syncDirection">,
): SyncPlan {
  const plan: SyncPlan = {
    uploads: [],
    downloads: [],
    localDeletes: [],
    remoteDeletes: [],
    conflicts: [],
    unchanged: [],
  };

  for (const entity of entities.values()) {
    // Assign decision to the entity
    assignDecision(entity, options);

    // Categorize based on decision
    categorizeEntity(entity, plan);
  }

  return plan;
}

/**
 * Assigns a sync decision to a MixedEntity.
 *
 * Implements the decision matrix based on presence and state of
 * local, remote, and prevSync entities.
 *
 * @param entity - MixedEntity to analyze
 * @param options - Sync options
 */
export function assignDecision(
  entity: MixedEntity,
  options: Pick<SyncOptions, "conflictAction" | "syncDirection">,
): void {
  const { local, remote, prevSync } = entity;

  if (entity.syncIssue) {
    entity.decision = "unsafe_local_state";
    entity.decisionBranch = 36;
    entity.change = false;
    return;
  }

  // Case 1: Both local and remote are missing (only in history)
  if (!local && !remote) {
    entity.decision = "only_history";
    entity.decisionBranch = 1;
    entity.change = false;
    return;
  }

  // Case 2: Both local and remote exist
  if (local && remote) {
    handleBothExist(entity, options);
    return;
  }

  // Case 3: Only remote exists (local is missing)
  if (!local && remote) {
    handleLocalMissing(entity, options);
    return;
  }

  // Case 4: Only local exists (remote is missing)
  if (local && !remote) {
    handleRemoteMissing(entity, options);
    return;
  }
}

/**
 * Handles the case where both local and remote entities exist.
 */
function handleBothExist(
  entity: MixedEntity,
  options: Pick<SyncOptions, "conflictAction" | "syncDirection">,
): void {
  const { local, remote, prevSync } = entity;
  const { conflictAction, syncDirection } = options;

  // Check if they're equal
  if (entitiesAreEqual(local!, remote!)) {
    entity.decision = "equal";
    entity.decisionBranch = 2;
    entity.change = false;
    return;
  }

  // They differ - need to determine which changed
  const localUnchanged = localEqualsPrevSync(local, prevSync);
  const remoteUnchanged = remoteEqualsPrevSync(remote, prevSync);

  if (localUnchanged && !remoteUnchanged) {
    // Local unchanged, remote modified -> pull
    if (syncDirection === "push_only") {
      entity.decision = "conflict_modified_then_keep_local";
      entity.decisionBranch = 26;
    } else {
      entity.decision = "remote_is_modified_then_pull";
      entity.decisionBranch = 9;
    }
    entity.change = true;
    return;
  }

  if (!localUnchanged && remoteUnchanged) {
    // Local modified, remote unchanged -> push
    if (syncDirection === "pull_only") {
      entity.decision = "conflict_modified_then_keep_remote";
      entity.decisionBranch = 27;
    } else {
      entity.decision = "local_is_modified_then_push";
      entity.decisionBranch = 10;
    }
    entity.change = true;
    return;
  }

  if (!localUnchanged && !remoteUnchanged) {
    // Both modified (conflict)
    handleConflict(entity, options, !!prevSync);
    return;
  }

  // Both equal to prevSync but not to each other (shouldn't happen normally)
  entity.decision = "equal";
  entity.decisionBranch = 21;
  entity.change = false;
}

/**
 * Handles the case where local entity is missing (only remote exists).
 */
function handleLocalMissing(
  entity: MixedEntity,
  options: Pick<SyncOptions, "conflictAction" | "syncDirection">,
): void {
  const { remote, prevSync } = entity;
  const { syncDirection } = options;

  if (isImageEntity(entity) && entity.localImageReferenced !== false) {
    entity.decision = "unsafe_local_state";
    entity.decisionBranch = 37;
    entity.change = false;
    return;
  }

  if (!prevSync) {
    // Remote is new (not in prev) -> pull
    if (syncDirection === "push_only") {
      entity.decision = "conflict_created_then_do_nothing";
      entity.decisionBranch = 28;
      entity.change = false;
    } else {
      entity.decision = "remote_is_created_then_pull";
      entity.decisionBranch = 3;
      entity.change = true;
    }
    return;
  }

  if (isImageEntity(entity) && entity.localImageReferenced === false) {
    if (syncDirection === "pull_only") {
      entity.decision = "conflict_created_then_keep_remote";
      entity.decisionBranch = 35;
      entity.change = true;
    } else {
      entity.decision = "local_is_deleted_thus_also_delete_remote";
      entity.decisionBranch = 38;
      entity.change = true;
    }
    return;
  }

  // prevSync exists - was local deleted or remote modified?
  const remoteUnchanged = remoteEqualsPrevSync(remote, prevSync);

  if (remoteUnchanged) {
    // Remote unchanged since last sync, local was deleted -> delete remote
    if (syncDirection === "pull_only") {
      entity.decision = "conflict_created_then_keep_remote";
      entity.decisionBranch = 35;
      entity.change = true;
    } else {
      entity.decision = "local_is_deleted_thus_also_delete_remote";
      entity.decisionBranch = 4;
      entity.change = true;
    }
  } else {
    // Remote was modified after local deletion -> conflict, pull the modified
    if (syncDirection === "push_only") {
      entity.decision = "conflict_created_then_do_nothing";
      entity.decisionBranch = 30;
      entity.change = false;
    } else {
      entity.decision = "remote_is_modified_then_pull";
      entity.decisionBranch = 5;
      entity.change = true;
    }
  }
}

/**
 * Handles the case where remote entity is missing (only local exists).
 */
function handleRemoteMissing(
  entity: MixedEntity,
  options: Pick<SyncOptions, "conflictAction" | "syncDirection">,
): void {
  const { local, prevSync } = entity;
  const { syncDirection } = options;

  if (!prevSync) {
    // Local is new (not in prev) -> push
    if (syncDirection === "pull_only") {
      entity.decision = "conflict_created_then_do_nothing";
      entity.decisionBranch = 31;
      entity.change = false;
    } else {
      entity.decision = "local_is_created_then_push";
      entity.decisionBranch = 6;
      entity.change = true;
    }
    return;
  }

  // prevSync exists - was remote deleted or local modified?
  const localUnchanged = localEqualsPrevSync(local, prevSync);

  if (localUnchanged) {
    // Local unchanged since last sync, remote was deleted -> delete local
    if (syncDirection === "push_only") {
      entity.decision = "conflict_created_then_keep_local";
      entity.decisionBranch = 32;
      entity.change = true;
    } else {
      entity.decision = "remote_is_deleted_thus_also_delete_local";
      entity.decisionBranch = 7;
      entity.change = true;
    }
  } else {
    // Local was modified after remote deletion -> conflict, push the modified
    if (syncDirection === "pull_only") {
      entity.decision = "conflict_created_then_do_nothing";
      entity.decisionBranch = 34;
      entity.change = false;
    } else {
      entity.decision = "local_is_modified_then_push";
      entity.decisionBranch = 8;
      entity.change = true;
    }
  }
}

/**
 * Handles conflict resolution when both local and remote are modified.
 */
function handleConflict(
  entity: MixedEntity,
  options: Pick<SyncOptions, "conflictAction" | "syncDirection">,
  hadPrevSync: boolean,
): void {
  const { local, remote } = entity;
  const { conflictAction, syncDirection } = options;

  // Determine winner based on conflict action
  let keepLocal: boolean;

  switch (conflictAction) {
    case "keep_local":
      keepLocal = true;
      break;
    case "keep_remote":
      keepLocal = false;
      break;
    case "keep_newer":
    default:
      // Compare mtimes, keep newer
      keepLocal = (local?.mtime ?? 0) >= (remote?.mtime ?? 0);
      break;
  }

  // Override based on sync direction
  if (syncDirection === "push_only") {
    keepLocal = true;
  } else if (syncDirection === "pull_only") {
    keepLocal = false;
  }

  const conflictType = hadPrevSync ? "modified" : "created";

  if (keepLocal) {
    entity.decision =
      conflictType === "created"
        ? "conflict_created_then_keep_local"
        : "conflict_modified_then_keep_local";
    entity.decisionBranch = conflictType === "created" ? 11 : 16;
  } else {
    entity.decision =
      conflictType === "created"
        ? "conflict_created_then_keep_remote"
        : "conflict_modified_then_keep_remote";
    entity.decisionBranch = conflictType === "created" ? 12 : 17;
  }

  entity.change = true;
}

/**
 * Categorizes an entity into the appropriate plan bucket based on its decision.
 */
function categorizeEntity(entity: MixedEntity, plan: SyncPlan): void {
  const { decision } = entity;

  if (!decision) {
    console.warn(`Entity ${entity.key} has no decision assigned`);
    return;
  }

  switch (decision) {
    // Unchanged
    case "equal":
    case "only_history":
    case "conflict_created_then_do_nothing":
    case "folder_existed_both_then_do_nothing":
    case "folder_to_skip":
    case "skip":
    case "too_large":
      plan.unchanged.push(entity);
      break;

    // Uploads (push to remote)
    case "local_is_created_then_push":
    case "local_is_modified_then_push":
    case "conflict_created_then_keep_local":
    case "conflict_modified_then_keep_local":
    case "folder_existed_local_then_also_create_remote":
      plan.uploads.push(entity);
      break;

    // Downloads (pull from remote)
    case "remote_is_created_then_pull":
    case "remote_is_modified_then_pull":
    case "conflict_created_then_keep_remote":
    case "conflict_modified_then_keep_remote":
    case "folder_existed_remote_then_also_create_local":
      plan.downloads.push(entity);
      break;

    // Local deletes
    case "remote_is_deleted_thus_also_delete_local":
    case "folder_to_be_deleted_on_local":
      plan.localDeletes.push(entity);
      break;

    // Remote deletes
    case "local_is_deleted_thus_also_delete_remote":
    case "folder_to_be_deleted_on_remote":
      plan.remoteDeletes.push(entity);
      break;

    // Directory operations
    case "folder_to_be_created":
      // Determine where to create based on existing state
      if (entity.local && !entity.remote) {
        plan.uploads.push(entity);
      } else if (!entity.local && entity.remote) {
        plan.downloads.push(entity);
      }
      break;

    case "unsafe_local_state":
      plan.conflicts.push(entity);
      break;

    default:
      console.warn(`Unknown decision: ${decision} for entity ${entity.key}`);
      plan.unchanged.push(entity);
  }
}

/** Counts entities whose state is unsafe to sync automatically. */
export function countUnsafeSyncEntities(plan: SyncPlan): number {
  return plan.conflicts.filter(
    (entity) => entity.decision === "unsafe_local_state" || !!entity.syncIssue,
  ).length;
}

/** Cache for summarizeSyncPlan to avoid repeated iteration over the same plan. */
const syncPlanSummaryCache = new WeakMap<SyncPlan, SyncPlanSummary>();

/**
 * Generates a summary of the sync plan for UI display.
 * Results are cached per plan instance to avoid redundant iteration.
 *
 * @param plan - The sync plan
 * @returns Summary with counts
 */
export function summarizeSyncPlan(plan: SyncPlan): SyncPlanSummary {
  const cached = syncPlanSummaryCache.get(plan);
  if (cached) return cached;

  let conflictCount = 0;
  for (const e of plan.uploads) {
    if (e.decision?.includes("conflict")) conflictCount++;
  }
  for (const e of plan.downloads) {
    if (e.decision?.includes("conflict")) conflictCount++;
  }
  const unsafeCount = countUnsafeSyncEntities(plan);

  const summary: SyncPlanSummary = {
    totalItems:
      plan.uploads.length +
      plan.downloads.length +
      plan.localDeletes.length +
      plan.remoteDeletes.length +
      plan.conflicts.length +
      plan.unchanged.length,
    uploadCount: plan.uploads.length,
    downloadCount: plan.downloads.length,
    localDeleteCount: plan.localDeletes.length,
    remoteDeleteCount: plan.remoteDeletes.length,
    conflictCount,
    unsafeCount,
    unchangedCount: plan.unchanged.length,
  };

  syncPlanSummaryCache.set(plan, summary);
  return summary;
}

/**
 * Checks if a sync plan is dangerous (would delete too many items).
 *
 * @param plan - The sync plan
 * @param threshold - Percentage threshold (0-100, default 30)
 * @returns true if the plan is dangerous
 */
export function isPlanDangerous(plan: SyncPlan, threshold = 30): boolean {
  const summary = summarizeSyncPlan(plan);
  const totalDeletions = summary.localDeleteCount + summary.remoteDeleteCount;
  const totalItems = summary.totalItems;

  if (totalItems === 0) return false;

  const deletePercentage = (totalDeletions / totalItems) * 100;
  return deletePercentage > threshold;
}

/**
 * Gets a human-readable description of the sync plan.
 *
 * @param plan - The sync plan
 * @returns Description string
 */
export function describeSyncPlan(plan: SyncPlan): string {
  const summary = summarizeSyncPlan(plan);
  const parts: string[] = [];

  if (summary.uploadCount > 0) {
    parts.push(`Upload ${summary.uploadCount}`);
  }
  if (summary.downloadCount > 0) {
    parts.push(`Download ${summary.downloadCount}`);
  }
  if (summary.localDeleteCount > 0) {
    parts.push(`Delete local ${summary.localDeleteCount}`);
  }
  if (summary.remoteDeleteCount > 0) {
    parts.push(`Delete remote ${summary.remoteDeleteCount}`);
  }
  if (summary.conflictCount > 0) {
    parts.push(`Resolve ${summary.conflictCount} conflicts`);
  }
  if (summary.unsafeCount > 0) {
    parts.push(`Blocked ${summary.unsafeCount} unsafe items`);
  }

  if (parts.length === 0) {
    return "No changes needed";
  }

  return parts.join(", ");
}

function isImageEntity(entity: MixedEntity): boolean {
  return (
    entity.local?.entityType === "image" ||
    entity.remote?.entityType === "image" ||
    entity.prevSync?.entityType === "image"
  );
}

/**
 * Validates that a sync plan can be executed.
 *
 * @param plan - The sync plan
 * @returns Array of validation errors, empty if valid
 */
export function validateSyncPlan(plan: SyncPlan): string[] {
  const errors: string[] = [];

  // Check for entities without IDs
  const allEntities = [
    ...plan.uploads,
    ...plan.downloads,
    ...plan.localDeletes,
    ...plan.remoteDeletes,
  ];

  for (const entity of allEntities) {
    const id = entity.local?.id || entity.remote?.id || entity.prevSync?.id;
    if (!id) {
      errors.push(`Entity ${entity.key} has no ID`);
    }

    if (!entity.decision) {
      errors.push(`Entity ${entity.key} has no decision`);
    }
  }

  return errors;
}
