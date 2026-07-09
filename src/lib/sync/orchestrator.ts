/**
 * Sync Orchestrator for the Three-Way Comparison Model.
 *
 * High-level module that orchestrates the complete sync workflow:
 * 1. Collect states (local, remote, prevSync)
 * 2. Ensemble into MixedEntities
 * 3. Generate sync plan
 * 4. Perform safety checks
 * 5. Execute sync plan
 *
 * This module provides the main entry point for incremental sync operations.
 */

import { getSyncEncryptionPassword } from "@/lib/credentials";
import { getAllDirectories } from "@/lib/db/directories";
import { getAllNotesWithContent } from "@/lib/db/notes";
import {
  completeSyncLog,
  createSyncLog,
  failSyncLog,
  updateSyncLogPlan,
  type SyncPlanLogSummary,
} from "@/lib/db/syncLogs";
import { getSyncProfileById, updateSyncProfile } from "@/lib/db/syncProfiles";
import {
  clearSyncRecordsByProfile,
  getSyncRecordsByProfile,
} from "@/lib/db/syncRecords";
import { getAllTags } from "@/lib/db/tags";
import type {
  ConflictAction,
  IncrementalSyncStatus,
  SyncDirection,
  SyncOptions,
  SyncPlan,
  SyncPlanSummary,
  SyncProgress,
  SyncResult,
} from "@/types/sync";
import { DEFAULT_SYNC_OPTIONS } from "@/types/sync";
import { collectAllStates } from "./collector";
import { ensembleMixedEntities } from "./ensemble";
import { executeSyncPlan, validateExecutorOptions } from "./executor";
import {
  formatSafetyReport,
  performSafetyChecks,
  type SafetyOptions,
  type SafetyReport,
} from "./guards";
import {
  countUnsafeSyncEntities,
  describeSyncPlan,
  generateSyncPlan,
  summarizeSyncPlan,
  validateSyncPlan,
} from "./planner";

/**
 * Converts a SyncPlanSummary to SyncPlanLogSummary format.
 */
function convertToLogSummary(summary: SyncPlanSummary): SyncPlanLogSummary {
  return {
    totalItems: summary.totalItems,
    uploads: summary.uploadCount,
    downloads: summary.downloadCount,
    localDeletes: summary.localDeleteCount,
    remoteDeletes: summary.remoteDeleteCount,
    conflicts: summary.conflictCount,
    unchanged: summary.unchangedCount,
  };
}

interface BucketIdentityComparison {
  bucketChanged: boolean;
  endpointChanged: boolean;
}

async function compareBucketIdentity(
  profileId: string,
  currentBucketName: string,
  currentEndpointUrl?: string,
): Promise<BucketIdentityComparison | null> {
  const profile = await getSyncProfileById(profileId);
  if (!profile) return null;

  let baselineBucket = profile.lastSyncedBucketName;
  let baselineEndpoint = profile.lastSyncedEndpointUrl;

  if (!baselineBucket) {
    const existingRecords = await getSyncRecordsByProfile(profileId);
    if (existingRecords.length === 0) {
      return {
        bucketChanged: false,
        endpointChanged: false,
      };
    }

    baselineBucket = profile.bucketName;
    baselineEndpoint = profile.endpointUrl;
  }

  return {
    bucketChanged: baselineBucket !== currentBucketName,
    endpointChanged:
      currentEndpointUrl !== undefined &&
      baselineEndpoint !== undefined &&
      baselineEndpoint !== currentEndpointUrl,
  };
}

/**
 * Checks whether syncing against the current bucket/endpoint would require
 * treating the run as a fresh sync, without mutating sync records.
 */
export async function hasBucketIdentityChanged(
  profileId: string,
  currentBucketName: string,
  currentEndpointUrl?: string,
): Promise<boolean> {
  const comparison = await compareBucketIdentity(
    profileId,
    currentBucketName,
    currentEndpointUrl,
  );

  return (
    !!comparison && (comparison.bucketChanged || comparison.endpointChanged)
  );
}

/**
 * Detects if the S3 bucket or endpoint has changed since the last successful sync.
 * If a change is detected, clears stale sync records to prevent the planner from
 * misinterpreting an empty new bucket as "all files deleted remotely."
 *
 * Handles the upgrade path: when lastSyncedBucketName is null (pre-fix users),
 * checks whether sync records exist. If they do, uses the profile's stored
 * bucketName/endpointUrl as the baseline for comparison.
 *
 * @param profileId - The sync profile ID
 * @param currentBucketName - The bucket being synced to now
 * @param currentEndpointUrl - The endpoint URL being used now
 * @returns true if a bucket change was detected and records were cleared
 */
export async function detectAndHandleBucketChange(
  profileId: string,
  currentBucketName: string,
  currentEndpointUrl?: string,
): Promise<boolean> {
  const comparison = await compareBucketIdentity(
    profileId,
    currentBucketName,
    currentEndpointUrl,
  );
  if (!comparison) return false;

  const { bucketChanged, endpointChanged } = comparison;

  if (bucketChanged || endpointChanged) {
    console.info(
      `[Sync] Bucket/endpoint change detected for profile ${profileId}. ` +
        `Current: ${currentBucketName} @ ${currentEndpointUrl ?? "unknown"}. ` +
        `Clearing stale sync records to treat this as a fresh sync.`,
    );

    await clearSyncRecordsByProfile(profileId);
    return true;
  }

  return false;
}

/**
 * Updates the profile with the current bucket name and endpoint URL
 * after a successful sync, so future syncs can detect changes.
 *
 * @param profileId - The sync profile ID
 * @param bucketName - The bucket that was just synced to
 * @param endpointUrl - The endpoint URL that was just used
 */
export async function recordSyncedBucketIdentity(
  profileId: string,
  bucketName: string,
  endpointUrl?: string,
): Promise<void> {
  const updates: Record<string, string> = {
    lastSyncedBucketName: bucketName,
  };
  if (endpointUrl !== undefined) {
    updates.lastSyncedEndpointUrl = endpointUrl;
  }
  await updateSyncProfile(profileId, updates);
}

/**
 * Options for performing an incremental sync.
 */
export interface IncrementalSyncOptions {
  /** Sync profile ID */
  profileId: string;
  /** S3 connection ID */
  connectionId: string;
  /** S3 bucket name */
  bucketName: string;
  /** S3 endpoint URL (from the active connection, used for bucket change detection) */
  endpointUrl?: string;
  /** Optional prefix for S3 keys (e.g., "zerosort/") */
  prefix: string;
  /** Whether to perform a dry run (preview only) */
  dryRun?: boolean;
  /** How to handle conflicts (default: "keep_newer") */
  conflictAction?: ConflictAction;
  /** Direction of sync (default: "bidirectional") */
  syncDirection?: SyncDirection;
  /** Maximum deletion percentage before aborting (0-100, default: 30) */
  protectModifyPercentage?: number;
  /** Maximum concurrent operations (default: 5) */
  concurrency?: number;
  /** Skip safety checks (used when user confirms despite warnings) */
  skipSafetyChecks?: boolean;
  /** Progress callback for UI updates */
  onProgress?: (progress: SyncProgress) => void;
  /** Status callback for phase changes */
  onStatusChange?: (status: Partial<IncrementalSyncStatus>) => void;
}

/**
 * Result of an incremental sync operation with additional metadata.
 */
export interface IncrementalSyncResult extends SyncResult {
  /** The sync plan that was (or would be) executed */
  plan: SyncPlan;
  /** Safety report from pre-execution checks */
  safetyReport: SafetyReport;
  /** Human-readable description of the sync */
  description: string;
  /** Whether the sync was blocked by safety checks */
  blockedBySafety: boolean;
  /** Sync log ID for tracking */
  logId?: string;
}

/**
 * Preview result for showing what would happen during sync.
 */
export interface SyncPreviewResult {
  /** The sync plan */
  plan: SyncPlan;
  /** Safety report */
  safetyReport: SafetyReport;
  /** Human-readable description */
  description: string;
  /** Whether execution would be blocked */
  wouldBeBlocked: boolean;
}

/**
 * Performs a complete incremental sync operation.
 *
 * This is the main entry point for the three-way comparison sync.
 * It orchestrates the complete workflow from state collection to execution.
 *
 * @param options - Sync options
 * @returns Promise resolving to the sync result
 */
export async function performIncrementalSync(
  options: IncrementalSyncOptions,
): Promise<IncrementalSyncResult> {
  const startedAt = new Date().toISOString();
  const {
    profileId,
    connectionId,
    bucketName,
    endpointUrl,
    prefix,
    dryRun = false,
    conflictAction = DEFAULT_SYNC_OPTIONS.conflictAction,
    syncDirection = DEFAULT_SYNC_OPTIONS.syncDirection,
    protectModifyPercentage = DEFAULT_SYNC_OPTIONS.protectModifyPercentage,
    concurrency = DEFAULT_SYNC_OPTIONS.concurrency,
    skipSafetyChecks = false,
    onProgress,
    onStatusChange,
  } = options;

  // Create sync log entry
  let logId: string | undefined;
  try {
    logId = await createSyncLog(profileId);
  } catch (error) {
    console.warn("Failed to create sync log:", error);
  }

  const updateStatus = (status: Partial<IncrementalSyncStatus>) => {
    onStatusChange?.({
      isSyncing: true,
      activeProfileId: profileId,
      ...status,
    });
  };

  try {
    // Retrieve encryption password - required for E2E encryption
    const encryptionPassword = await getSyncEncryptionPassword();
    if (!encryptionPassword) {
      throw new Error(
        "Sync encryption password not configured. Please set it in Settings > Cloud Sync.",
      );
    }

    // Detect bucket or endpoint changes to prevent stale sync records
    // from causing incorrect deletion decisions
    const bucketChanged = await detectAndHandleBucketChange(
      profileId,
      bucketName,
      endpointUrl,
    );
    if (bucketChanged) {
      console.info(
        "[Sync] Stale sync records cleared due to bucket/endpoint change. " +
          "This sync will be treated as a first sync.",
      );
    }

    // Phase 1: Collecting states
    updateStatus({ phase: "collecting", progress: null });
    onProgress?.({ phase: "collecting", current: 0, total: 3 });

    const [notes, directories, tags] = await Promise.all([
      getAllNotesWithContent(),
      getAllDirectories(),
      getAllTags(),
    ]);

    onProgress?.({ phase: "collecting", current: 1, total: 3 });

    const collectedState = await collectAllStates(
      notes,
      directories,
      {
        profileId,
        connectionId,
        bucketName,
        prefix,
      },
      tags,
    );

    onProgress?.({ phase: "collecting", current: 3, total: 3 });

    // Phase 2: Planning
    updateStatus({ phase: "planning" });
    onProgress?.({ phase: "planning", current: 0, total: 1 });

    const mixedEntities = ensembleMixedEntities(collectedState);

    const syncOptions: Pick<SyncOptions, "conflictAction" | "syncDirection"> = {
      conflictAction,
      syncDirection,
    };

    const plan = generateSyncPlan(mixedEntities, syncOptions);

    // Validate plan
    const planErrors = validateSyncPlan(plan);
    if (planErrors.length > 0) {
      throw new Error(`Invalid sync plan: ${planErrors.join(", ")}`);
    }

    onProgress?.({ phase: "planning", current: 1, total: 1 });

    // Phase 3: Safety checks
    const safetyOptions: SafetyOptions = {
      protectModifyPercentage,
      minItemsForProtection: 5,
      allowEmptyLocal: false,
      allowEmptyRemote: false,
    };

    const safetyReport = performSafetyChecks(plan, safetyOptions);
    const description = describeSyncPlan(plan);

    // Check if blocked by safety (skip if user already confirmed)
    if (!safetyReport.passed && !skipSafetyChecks) {
      const result: IncrementalSyncResult = {
        success: false,
        startedAt,
        completedAt: new Date().toISOString(),
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        conflicts: 0,
        errors: [`Safety check failed: ${formatSafetyReport(safetyReport)}`],
        plan,
        safetyReport,
        description,
        blockedBySafety: true,
        logId,
      };

      // Update log with failure
      if (logId) {
        const planLogSummary = convertToLogSummary(summarizeSyncPlan(plan));
        await updateSyncLogPlan(logId, planLogSummary);
        await failSyncLog(logId, "Blocked by safety checks");
      }

      updateStatus({
        isSyncing: false,
        phase: "idle",
        lastError: "Sync blocked by safety checks",
      });

      return result;
    }

    // If dry run, return preview
    if (dryRun) {
      const summary = summarizeSyncPlan(plan);
      const result: IncrementalSyncResult = {
        success: true,
        startedAt,
        completedAt: new Date().toISOString(),
        uploaded: summary.uploadCount,
        downloaded: summary.downloadCount,
        deleted: summary.localDeleteCount + summary.remoteDeleteCount,
        conflicts: summary.conflictCount,
        errors: [],
        plan,
        safetyReport,
        description,
        blockedBySafety: false,
        logId,
      };

      if (logId) {
        const planLogSummary = convertToLogSummary(summary);
        await updateSyncLogPlan(logId, planLogSummary);
        await completeSyncLog(logId, {
          uploadCount: summary.uploadCount,
          downloadCount: summary.downloadCount,
          deleteCount: summary.localDeleteCount + summary.remoteDeleteCount,
          conflictCount: summary.conflictCount,
        });
      }

      updateStatus({
        isSyncing: false,
        phase: "idle",
        lastSyncAt: new Date().toISOString(),
      });

      return result;
    }

    // Phase 4: Execution
    updateStatus({ phase: "executing" });

    // Validate executor options
    const executorOptions = {
      connectionId,
      bucketName,
      profileId,
      prefix,
      concurrency,
      dryRun: false,
      onProgress,
      encryptionPassword,
    };

    const executorErrors = validateExecutorOptions(executorOptions);
    if (executorErrors.length > 0) {
      throw new Error(`Invalid executor options: ${executorErrors.join(", ")}`);
    }

    const execResult = await executeSyncPlan(plan, executorOptions);

    // Build final result
    const result: IncrementalSyncResult = {
      ...execResult,
      plan,
      safetyReport,
      description,
      blockedBySafety: false,
      logId,
    };

    // Update log
    if (logId) {
      const planLogSummary = convertToLogSummary(summarizeSyncPlan(plan));
      await updateSyncLogPlan(logId, planLogSummary);
      if (execResult.success) {
        await completeSyncLog(logId, {
          uploadCount: execResult.uploaded,
          downloadCount: execResult.downloaded,
          deleteCount: execResult.deleted,
          conflictCount: execResult.conflicts,
        });
      } else {
        await failSyncLog(
          logId,
          execResult.errors.length > 0
            ? execResult.errors.join("; ")
            : "Unknown error",
        );
      }
    }

    // Record bucket identity after successful sync for future change detection
    if (execResult.success) {
      await recordSyncedBucketIdentity(profileId, bucketName, endpointUrl);
    }

    updateStatus({
      isSyncing: false,
      phase: "idle",
      lastSyncAt: new Date().toISOString(),
      lastError: execResult.success ? null : execResult.errors[0] || null,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error during sync";

    // Update log with error
    if (logId) {
      await failSyncLog(logId, errorMessage);
    }

    updateStatus({
      isSyncing: false,
      phase: "idle",
      lastError: errorMessage,
    });

    // Return error result
    return {
      success: false,
      startedAt,
      completedAt: new Date().toISOString(),
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      conflicts: 0,
      errors: [errorMessage],
      plan: {
        uploads: [],
        downloads: [],
        localDeletes: [],
        remoteDeletes: [],
        conflicts: [],
        unchanged: [],
      },
      safetyReport: {
        passed: false,
        checks: [],
        summary: {
          totalItems: 0,
          uploadCount: 0,
          downloadCount: 0,
          localDeleteCount: 0,
          remoteDeleteCount: 0,
          conflictCount: 0,
          unsafeCount: 0,
          unchangedCount: 0,
        },
        requiresConfirmation: false,
        confirmable: false,
      },
      description: "Sync failed",
      blockedBySafety: false,
      logId,
    };
  }
}

/**
 * Generates a preview of what a sync would do without executing.
 *
 * This is useful for showing the user what changes would occur
 * before they confirm the sync operation.
 *
 * @param options - Sync options (same as performIncrementalSync)
 * @returns Promise resolving to the preview result
 */
export async function previewIncrementalSync(
  options: Omit<
    IncrementalSyncOptions,
    "dryRun" | "onProgress" | "onStatusChange"
  >,
): Promise<SyncPreviewResult> {
  const {
    profileId,
    connectionId,
    bucketName,
    endpointUrl,
    prefix,
    conflictAction = DEFAULT_SYNC_OPTIONS.conflictAction,
    syncDirection = DEFAULT_SYNC_OPTIONS.syncDirection,
    protectModifyPercentage = DEFAULT_SYNC_OPTIONS.protectModifyPercentage,
  } = options;

  const bucketIdentityChanged = await hasBucketIdentityChanged(
    profileId,
    bucketName,
    endpointUrl,
  );

  // Collect states
  const [notes, directories, tags] = await Promise.all([
    getAllNotesWithContent(),
    getAllDirectories(),
    getAllTags(),
  ]);

  const collectedState = await collectAllStates(
    notes,
    directories,
    {
      profileId,
      connectionId,
      bucketName,
      prefix,
    },
    tags,
  );

  if (bucketIdentityChanged) {
    collectedState.prevSync = new Map();
  }

  // Generate plan
  const mixedEntities = ensembleMixedEntities(collectedState);
  const plan = generateSyncPlan(mixedEntities, {
    conflictAction,
    syncDirection,
  });

  // Safety checks
  let safetyReport = performSafetyChecks(plan, {
    protectModifyPercentage,
    minItemsForProtection: 5,
    allowEmptyLocal: false,
    allowEmptyRemote: false,
  });

  return {
    plan,
    safetyReport,
    description: describeSyncPlan(plan),
    wouldBeBlocked: !safetyReport.passed,
  };
}

/**
 * Checks if an incremental sync is needed by comparing local and remote states.
 *
 * @param options - Options for checking sync status
 * @returns Promise resolving to whether sync is needed
 */
export async function isIncrementalSyncNeeded(
  options: Pick<
    IncrementalSyncOptions,
    "profileId" | "connectionId" | "bucketName" | "prefix"
  >,
): Promise<boolean> {
  const { profileId, connectionId, bucketName, prefix } = options;

  const [notes, directories, tags] = await Promise.all([
    getAllNotesWithContent(),
    getAllDirectories(),
    getAllTags(),
  ]);

  const collectedState = await collectAllStates(
    notes,
    directories,
    {
      profileId,
      connectionId,
      bucketName,
      prefix,
    },
    tags,
  );

  const mixedEntities = ensembleMixedEntities(collectedState);
  const plan = generateSyncPlan(mixedEntities, {
    conflictAction: "keep_newer",
    syncDirection: "bidirectional",
  });

  const summary = summarizeSyncPlan(plan);

  return (
    summary.uploadCount > 0 ||
    summary.downloadCount > 0 ||
    summary.localDeleteCount > 0 ||
    summary.remoteDeleteCount > 0 ||
    countUnsafeSyncEntities(plan) > 0
  );
}

/**
 * Gets the current sync status summary.
 *
 * @param options - Options for checking status
 * @returns Promise resolving to sync plan summary
 */
export async function getIncrementalSyncStatus(
  options: Pick<
    IncrementalSyncOptions,
    "profileId" | "connectionId" | "bucketName" | "prefix"
  >,
): Promise<{
  isNeeded: boolean;
  summary: ReturnType<typeof summarizeSyncPlan>;
  description: string;
}> {
  const { profileId, connectionId, bucketName, prefix } = options;

  const [notes, directories, tags] = await Promise.all([
    getAllNotesWithContent(),
    getAllDirectories(),
    getAllTags(),
  ]);

  const collectedState = await collectAllStates(
    notes,
    directories,
    {
      profileId,
      connectionId,
      bucketName,
      prefix,
    },
    tags,
  );

  const mixedEntities = ensembleMixedEntities(collectedState);
  const plan = generateSyncPlan(mixedEntities, {
    conflictAction: "keep_newer",
    syncDirection: "bidirectional",
  });

  const summary = summarizeSyncPlan(plan);
  const description = describeSyncPlan(plan);

  const isNeeded =
    summary.uploadCount > 0 ||
    summary.downloadCount > 0 ||
    summary.localDeleteCount > 0 ||
    summary.remoteDeleteCount > 0;

  return {
    isNeeded,
    summary,
    description,
  };
}
