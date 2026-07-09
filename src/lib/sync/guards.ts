/**
 * Safety Guards for the Three-Way Comparison Sync Model.
 *
 * Provides safety mechanisms to prevent data loss:
 * - Delete protection (abort if too many deletions)
 * - Mtime normalization for cross-platform compatibility
 * - Dry run support for previewing changes
 * - Validation of sync state before execution
 */

import type { SyncPlan, SyncPlanSummary } from "@/types/sync";
import { countUnsafeSyncEntities, summarizeSyncPlan } from "./planner";

export type SafetyCheckCode =
  | "deletion_percentage"
  | "mass_deletion"
  | "first_sync"
  | "empty_remote"
  | "unexpected_empty_local"
  | "conflicts"
  | "unsafe_entities"
  | "one_sided_sync"
  | "ok";

/**
 * Result of a safety check.
 */
export interface SafetyCheckResult {
  /** Stable machine-readable code for the check. */
  code: SafetyCheckCode;
  /** Whether the check passed */
  passed: boolean;
  /** Warning message if check failed */
  warning?: string;
  /** Severity level */
  severity: "info" | "warning" | "danger";
  /** Detailed information */
  details?: string;
}

/**
 * Collection of all safety check results.
 */
export interface SafetyReport {
  /** Overall pass/fail status */
  passed: boolean;
  /** Individual check results */
  checks: SafetyCheckResult[];
  /** Summary of the sync plan */
  summary: SyncPlanSummary;
  /** Whether user confirmation is recommended */
  requiresConfirmation: boolean;
  /** Whether the blocked sync can be overridden by explicit confirmation. */
  confirmable: boolean;
}

/**
 * Options for safety checks.
 */
export interface SafetyOptions {
  /** Maximum allowed deletion percentage (0-100, default: 30) */
  protectModifyPercentage?: number;
  /** Minimum number of items before deletion protection kicks in */
  minItemsForProtection?: number;
  /** Whether to allow empty local state (first sync) */
  allowEmptyLocal?: boolean;
  /** Whether to allow empty remote state (clean bucket) */
  allowEmptyRemote?: boolean;
}

const DEFAULT_SAFETY_OPTIONS: SafetyOptions = {
  protectModifyPercentage: 30,
  minItemsForProtection: 5,
  allowEmptyLocal: true,
  allowEmptyRemote: false,
};

/**
 * Performs all safety checks on a sync plan.
 *
 * @param plan - The sync plan to check
 * @param options - Safety check options
 * @returns Safety report with all check results
 */
export function performSafetyChecks(
  plan: SyncPlan,
  options: SafetyOptions = {},
): SafetyReport {
  const opts = { ...DEFAULT_SAFETY_OPTIONS, ...options };
  const summary = summarizeSyncPlan(plan);
  const checks: SafetyCheckResult[] = [];

  // Check 1: Deletion percentage protection
  checks.push(checkDeletionPercentage(plan, summary, opts));

  // Check 2: Mass deletion warning
  checks.push(checkMassDeletion(summary, opts));

  // Check 3: Empty state detection
  checks.push(checkEmptyStates(plan, opts));

  // Check 4: Conflict detection
  checks.push(checkConflicts(summary));

  // Check 5: Unsafe entity detection
  checks.push(checkUnsafeEntities(plan));

  // Check 6: One-sided sync detection
  checks.push(checkOneSidedSync(plan, summary));

  // Determine overall status
  const passed = checks.every((c) => c.passed || c.severity !== "danger");
  const requiresConfirmation = checks.some(
    (c) =>
      (!c.passed && c.severity === "danger") ||
      (c.warning && (c.severity === "danger" || c.severity === "warning")),
  );
  const confirmable = !checks.some(
    (c) => c.code === "unexpected_empty_local" && !c.passed,
  );

  return {
    passed,
    checks,
    summary,
    requiresConfirmation,
    confirmable,
  };
}

/**
 * Checks if the deletion percentage exceeds the threshold.
 */
function checkDeletionPercentage(
  plan: SyncPlan,
  summary: SyncPlanSummary,
  options: SafetyOptions,
): SafetyCheckResult {
  const totalDeletions = summary.localDeleteCount + summary.remoteDeleteCount;
  const totalItems = summary.totalItems;

  // Skip check if too few items
  if (totalItems < (options.minItemsForProtection ?? 5)) {
    return {
      code: "ok",
      passed: true,
      severity: "info",
      details: `Skipping deletion check: only ${totalItems} items`,
    };
  }

  const deletePercentage = (totalDeletions / totalItems) * 100;
  const threshold = options.protectModifyPercentage ?? 30;

  if (deletePercentage > threshold) {
    return {
      code: "deletion_percentage",
      passed: false,
      severity: "danger",
      warning: `High deletion rate detected: ${deletePercentage.toFixed(1)}% of items would be deleted`,
      details: `This exceeds the ${threshold}% safety threshold. ${totalDeletions} out of ${totalItems} items would be deleted.`,
    };
  }

  return {
    code: "deletion_percentage",
    passed: true,
    severity: "info",
    details: `Deletion rate: ${deletePercentage.toFixed(1)}% (threshold: ${threshold}%)`,
  };
}

/**
 * Checks for mass deletion (absolute numbers).
 */
function checkMassDeletion(
  summary: SyncPlanSummary,
  options: SafetyOptions,
): SafetyCheckResult {
  const totalDeletions = summary.localDeleteCount + summary.remoteDeleteCount;

  if (totalDeletions >= 10) {
    return {
      code: "mass_deletion",
      passed: true,
      severity: "warning",
      warning: `${totalDeletions} items will be deleted`,
      details: `Local: ${summary.localDeleteCount}, Remote: ${summary.remoteDeleteCount}`,
    };
  }

  return {
    code: "mass_deletion",
    passed: true,
    severity: "info",
    details: `${totalDeletions} deletions planned`,
  };
}

/**
 * Checks for potentially dangerous empty states.
 */
function checkEmptyStates(
  plan: SyncPlan,
  options: SafetyOptions,
): SafetyCheckResult {
  const totalItems =
    plan.uploads.length +
    plan.downloads.length +
    plan.localDeletes.length +
    plan.remoteDeletes.length +
    plan.conflicts.length +
    plan.unchanged.length;

  // Count entities that only exist on one side
  const localOnlyCount = plan.uploads.filter(
    (e) => e.local && !e.remote && !e.prevSync,
  ).length;

  const remoteOnlyCount = plan.downloads.filter(
    (e) => e.remote && !e.local && !e.prevSync,
  ).length;

  // Check for first-sync scenario (all items are new on one side)
  const isFirstSync =
    localOnlyCount === totalItems || remoteOnlyCount === totalItems;

  if (isFirstSync && totalItems > 0) {
    return {
      code: "first_sync",
      passed: true,
      severity: "info",
      details: `First sync detected: ${totalItems} items to sync`,
    };
  }

  // Check for potentially dangerous state where one side appears empty
  if (
    totalItems > 0 &&
    plan.localDeletes.length === totalItems &&
    plan.downloads.length === 0 &&
    plan.uploads.length === 0
  ) {
    if (!options.allowEmptyRemote) {
      return {
        code: "empty_remote",
        passed: false,
        severity: "danger",
        warning: "Remote appears empty - all local items would be deleted",
        details:
          "This may indicate a configuration issue or accidental bucket wipe",
      };
    }
  }

  if (
    totalItems > 0 &&
    plan.remoteDeletes.length === totalItems &&
    plan.uploads.length === 0 &&
    plan.downloads.length === 0
  ) {
    if (!options.allowEmptyLocal) {
      return {
        code: "unexpected_empty_local",
        passed: false,
        severity: "danger",
        warning: "Local appears empty - all remote items would be deleted",
        details: "This may indicate a fresh install or database reset",
      };
    }
  }

  return {
    code: "ok",
    passed: true,
    severity: "info",
  };
}

/**
 * Checks for conflicts that need attention.
 */
function checkConflicts(summary: SyncPlanSummary): SafetyCheckResult {
  if (summary.conflictCount > 0) {
    return {
      code: "conflicts",
      passed: true, // Conflicts are handled by the planner
      severity: "warning",
      warning: `${summary.conflictCount} conflict(s) will be auto-resolved`,
      details:
        "Conflicts are resolved based on your conflict resolution settings",
    };
  }

  return {
    code: "conflicts",
    passed: true,
    severity: "info",
    details: "No conflicts detected",
  };
}

/** Blocks sync when the planner produced an unsafe entity state. */
function checkUnsafeEntities(plan: SyncPlan): SafetyCheckResult {
  const unsafeEntities = plan.conflicts.filter(
    (entity) => entity.decision === "unsafe_local_state" || !!entity.syncIssue,
  );

  if (unsafeEntities.length === 0) {
    return {
      code: "ok",
      passed: true,
      severity: "info",
      details: "No unsafe entity states detected",
    };
  }

  const details = unsafeEntities
    .map(
      (entity) =>
        entity.syncIssue ?? `${entity.key} is in an unsafe sync state`,
    )
    .join("; ");

  return {
    code: "unsafe_entities",
    passed: false,
    severity: "danger",
    warning: `${countUnsafeSyncEntities(plan)} unsafe item(s) require manual intervention`,
    details,
  };
}

/**
 * Checks for one-sided sync (all operations going one direction).
 */
function checkOneSidedSync(
  plan: SyncPlan,
  summary: SyncPlanSummary,
): SafetyCheckResult {
  const hasUploads = summary.uploadCount > 0;
  const hasDownloads = summary.downloadCount > 0;
  const hasLocalDeletes = summary.localDeleteCount > 0;
  const hasRemoteDeletes = summary.remoteDeleteCount > 0;

  // Only pushing
  if ((hasUploads || hasRemoteDeletes) && !hasDownloads && !hasLocalDeletes) {
    return {
      code: "one_sided_sync",
      passed: true,
      severity: "info",
      details: `One-way sync: pushing ${summary.uploadCount} items to remote`,
    };
  }

  // Only pulling
  if ((hasDownloads || hasLocalDeletes) && !hasUploads && !hasRemoteDeletes) {
    return {
      code: "one_sided_sync",
      passed: true,
      severity: "info",
      details: `One-way sync: pulling ${summary.downloadCount} items from remote`,
    };
  }

  return {
    code: "ok",
    passed: true,
    severity: "info",
  };
}

/**
 * Formats a safety report for display.
 *
 * @param report - Safety report to format
 * @returns Human-readable string
 */
export function formatSafetyReport(report: SafetyReport): string {
  const lines: string[] = [];

  lines.push(`=== Sync Safety Report ===`);
  lines.push(`Status: ${report.passed ? "PASSED" : "BLOCKED"}`);
  lines.push("");

  lines.push("Summary:");
  lines.push(`  Upload: ${report.summary.uploadCount}`);
  lines.push(`  Download: ${report.summary.downloadCount}`);
  lines.push(`  Delete Local: ${report.summary.localDeleteCount}`);
  lines.push(`  Delete Remote: ${report.summary.remoteDeleteCount}`);
  lines.push(`  Conflicts: ${report.summary.conflictCount}`);
  lines.push(`  Unsafe: ${report.summary.unsafeCount}`);
  lines.push(`  Unchanged: ${report.summary.unchangedCount}`);
  lines.push("");

  const warnings = report.checks.filter((c) => c.warning);
  if (warnings.length > 0) {
    lines.push("Warnings:");
    for (const check of warnings) {
      const icon = check.severity === "danger" ? "[!]" : "[*]";
      lines.push(`  ${icon} ${check.warning}`);
      if (check.details) {
        lines.push(`      ${check.details}`);
      }
    }
  }

  if (report.requiresConfirmation) {
    lines.push("");
    lines.push("User confirmation required before proceeding.");
  }

  return lines.join("\n");
}

/**
 * Creates a preview of what the sync will do.
 *
 * @param plan - The sync plan
 * @returns Array of action descriptions
 */
export function createSyncPreview(plan: SyncPlan): string[] {
  const preview: string[] = [];

  for (const entity of plan.uploads) {
    const action = entity.decision?.includes("created") ? "Create" : "Update";
    preview.push(`[UPLOAD] ${action} remote: ${entity.key}`);
  }

  for (const entity of plan.downloads) {
    const action = entity.decision?.includes("created") ? "Create" : "Update";
    preview.push(`[DOWNLOAD] ${action} local: ${entity.key}`);
  }

  for (const entity of plan.localDeletes) {
    preview.push(`[DELETE LOCAL] ${entity.key}`);
  }

  for (const entity of plan.remoteDeletes) {
    preview.push(`[DELETE REMOTE] ${entity.key}`);
  }

  for (const entity of plan.conflicts) {
    if (entity.decision === "unsafe_local_state" || entity.syncIssue) {
      preview.push(`[BLOCKED] ${entity.key}`);
    }
  }

  return preview;
}

/**
 * Checks if a sync plan is safe to execute without confirmation.
 *
 * @param plan - The sync plan
 * @param options - Safety options
 * @returns true if safe to auto-execute
 */
export function isSafeToAutoSync(
  plan: SyncPlan,
  options: SafetyOptions = {},
): boolean {
  const report = performSafetyChecks(plan, options);
  return report.passed && !report.requiresConfirmation;
}
