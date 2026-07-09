/**
 * Tests for the sync guards module - Safety checks for sync operations.
 */

import type { SyncPlan } from "@/types/sync";
import { describe, expect, it } from "vitest";
import {
  createSyncPreview,
  formatSafetyReport,
  isSafeToAutoSync,
  performSafetyChecks,
} from "../guards";
import { createMockSyncPlan } from "./test-utils";

describe("Guards - Deletion Percentage Protection", () => {
  it("Should block when deletion percentage exceeds threshold", () => {
    const plan = createMockSyncPlan({
      uploads: 0,
      downloads: 0,
      localDeletes: 40,
      remoteDeletes: 0,
      unchanged: 60,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, {
      protectModifyPercentage: 30,
      minItemsForProtection: 5,
    });

    const deletionCheck = report.checks.find(
      (c) =>
        c.details?.toLowerCase().includes("deletion rate") ||
        c.warning?.toLowerCase().includes("deletion rate"),
    );
    expect(deletionCheck?.passed).toBe(false);
    expect(deletionCheck?.severity).toBe("danger");
    expect(report.passed).toBe(false);
  });

  it("Should allow when deletion percentage is within threshold", () => {
    const plan = createMockSyncPlan({
      uploads: 0,
      downloads: 0,
      localDeletes: 2,
      remoteDeletes: 0,
      unchanged: 98,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, {
      protectModifyPercentage: 30,
      minItemsForProtection: 5,
    });

    const deletionCheck = report.checks.find(
      (c) =>
        c.details?.toLowerCase().includes("deletion rate") ||
        c.warning?.toLowerCase().includes("deletion rate"),
    );
    expect(deletionCheck?.passed).toBe(true);
  });

  it("Should skip check when too few items", () => {
    const plan = createMockSyncPlan({
      uploads: 0,
      downloads: 0,
      localDeletes: 2,
      remoteDeletes: 0,
      unchanged: 2,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, {
      protectModifyPercentage: 30,
      minItemsForProtection: 5,
    });

    const deletionCheck = report.checks.find((c) =>
      c.details?.includes("Skipping deletion check"),
    );
    expect(deletionCheck?.passed).toBe(true);
  });
});

describe("Guards - Mass Deletion Warning", () => {
  it("Should warn when deleting 10+ items", () => {
    const plan = createMockSyncPlan({
      uploads: 0,
      downloads: 0,
      localDeletes: 15,
      remoteDeletes: 0,
      unchanged: 0,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const massDeleteCheck = report.checks.find((c) =>
      c.warning?.includes("items will be deleted"),
    );
    expect(massDeleteCheck?.severity).toBe("warning");
  });

  it("Should not warn when deleting fewer than 10 items", () => {
    const plan = createMockSyncPlan({
      uploads: 0,
      downloads: 0,
      localDeletes: 5,
      remoteDeletes: 0,
      unchanged: 0,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const massDeleteCheck = report.checks.find((c) =>
      c.warning?.includes("items will be deleted"),
    );
    expect(massDeleteCheck).toBeUndefined();
  });
});

describe("Guards - Empty State Detection", () => {
  it("Should detect first sync scenario", () => {
    const plan = createMockSyncPlan({
      uploads: 10,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const emptyCheck = report.checks.find((c) =>
      c.details?.includes("First sync detected"),
    );
    expect(emptyCheck?.details).toContain("First sync detected: 10 items");
  });

  it("Should block when remote appears empty and deletions planned", () => {
    const plan = createMockSyncPlan({
      localDeletes: 10,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, {
      allowEmptyRemote: false,
    });

    const emptyCheck = report.checks.find((c) =>
      c.warning?.includes("Remote appears empty"),
    );
    expect(emptyCheck?.passed).toBe(false);
    expect(emptyCheck?.severity).toBe("danger");
  });

  it("Should block when local appears empty and deletions planned", () => {
    const plan = createMockSyncPlan({
      remoteDeletes: 10,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, {
      allowEmptyLocal: false,
    });

    const emptyCheck = report.checks.find((c) =>
      c.warning?.toLowerCase().includes("local appears empty"),
    );
    expect(emptyCheck?.passed).toBe(false);
    expect(emptyCheck?.severity).toBe("danger");
  });

  it("Should allow normal remote deletions when local is not actually empty", () => {
    const plan = createMockSyncPlan({
      remoteDeletes: 1,
      unchanged: 3,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, {
      allowEmptyLocal: false,
    });

    const emptyCheck = report.checks.find(
      (c) => c.code === "unexpected_empty_local",
    );
    expect(emptyCheck).toBeUndefined();
    expect(report.passed).toBe(true);
  });
});

describe("Guards - Conflict Detection", () => {
  it("Should warn about conflicts to be resolved", () => {
    const plan = createMockSyncPlan({
      uploads: 3,
      downloads: 2,
      conflicts: 5,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const conflictCheck = report.checks.find((c) =>
      c.warning?.includes("conflict"),
    );
    expect(conflictCheck?.passed).toBe(true);
    expect(conflictCheck?.severity).toBe("warning");
  });

  it("Should report no conflicts when none detected", () => {
    const plan = createMockSyncPlan({
      uploads: 3,
      downloads: 2,
      unchanged: 5,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const conflictCheck = report.checks.find((c) =>
      c.details?.includes("No conflicts"),
    );
    expect(conflictCheck?.passed).toBe(true);
  });
});

describe("Guards - One-Sided Sync Detection", () => {
  it("Should detect push-only sync", () => {
    const plan = createMockSyncPlan({
      uploads: 10,
      remoteDeletes: 2,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const oneSidedCheck = report.checks.find((c) =>
      c.details?.includes("One-way sync: pushing"),
    );
    expect(oneSidedCheck?.details).toContain("pushing");
  });

  it("Should detect pull-only sync", () => {
    const plan = createMockSyncPlan({
      downloads: 10,
      localDeletes: 2,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    const oneSidedCheck = report.checks.find((c) =>
      c.details?.includes("One-way sync: pulling"),
    );
    expect(oneSidedCheck?.details).toContain("pulling");
  });
});

describe("Guards - Report Formatting", () => {
  it("Should format passed report correctly", () => {
    const plan = createMockSyncPlan({
      uploads: 5,
      downloads: 3,
      unchanged: 10,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);
    const formatted = formatSafetyReport(report);

    expect(formatted).toContain("PASSED");
    expect(formatted).toContain("Upload: 5");
    expect(formatted).toContain("Download: 3");
  });

  it("Should format blocked report correctly", () => {
    const plan = createMockSyncPlan({
      localDeletes: 50,
      unchanged: 50,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, { protectModifyPercentage: 30 });
    const formatted = formatSafetyReport(report);

    expect(formatted).toContain("BLOCKED");
    expect(formatted).toContain("Delete Local: 50");
  });

  it("Should include warnings in formatted report", () => {
    const plan = createMockSyncPlan({
      localDeletes: 15,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);
    const formatted = formatSafetyReport(report);

    expect(formatted).toContain("Warnings:");
    expect(formatted).toContain("15 items will be deleted");
  });
});

describe("Guards - Sync Preview", () => {
  it("Should create preview of upload actions", () => {
    const plan = createMockSyncPlan({ uploads: 2 }) as SyncPlan;

    const preview = createSyncPreview(plan);

    expect(preview).toHaveLength(2);
    expect(preview[0]).toContain("UPLOAD");
  });

  it("Should create preview of download actions", () => {
    const plan = createMockSyncPlan({ downloads: 2 }) as SyncPlan;

    const preview = createSyncPreview(plan);

    expect(preview).toHaveLength(2);
    expect(preview[0]).toContain("DOWNLOAD");
  });

  it("Should create preview of delete actions", () => {
    const plan = createMockSyncPlan({
      localDeletes: 2,
      remoteDeletes: 2,
    }) as SyncPlan;

    const preview = createSyncPreview(plan);

    expect(preview).toHaveLength(4);
    const localDeletes = preview.filter((p) => p.includes("DELETE LOCAL"));
    const remoteDeletes = preview.filter((p) => p.includes("DELETE REMOTE"));
    expect(localDeletes).toHaveLength(2);
    expect(remoteDeletes).toHaveLength(2);
  });
});

describe("Guards - Auto-Sync Safety", () => {
  it("Should allow auto-sync when safe", () => {
    const plan = createMockSyncPlan({
      uploads: 5,
      unchanged: 10,
    }) as SyncPlan;

    expect(isSafeToAutoSync(plan)).toBe(true);
  });

  it("Should not allow auto-sync when blocked", () => {
    const plan = createMockSyncPlan({
      localDeletes: 50,
      unchanged: 50,
    }) as SyncPlan;

    expect(isSafeToAutoSync(plan, { protectModifyPercentage: 30 })).toBe(false);
  });

  it("Should not allow auto-sync when confirmation required", () => {
    const plan = createMockSyncPlan({
      localDeletes: 15, // Mass deletion warning
    }) as SyncPlan;

    expect(isSafeToAutoSync(plan)).toBe(false);
  });
});

describe("Guards - Overall Report Status", () => {
  it("Should pass when all checks pass", () => {
    const plan = createMockSyncPlan({
      uploads: 5,
      downloads: 3,
      unchanged: 10,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    expect(report.passed).toBe(true);
    expect(report.requiresConfirmation).toBe(false);
  });

  it("Should fail when any danger check fails", () => {
    const plan = createMockSyncPlan({
      localDeletes: 50,
      unchanged: 50,
    }) as SyncPlan;

    const report = performSafetyChecks(plan, { protectModifyPercentage: 30 });

    expect(report.passed).toBe(false);
    expect(report.requiresConfirmation).toBe(true);
  });

  it("Should require confirmation when warnings present", () => {
    const plan = createMockSyncPlan({
      uploads: 5,
      conflicts: 3,
      unchanged: 10,
    }) as SyncPlan;

    const report = performSafetyChecks(plan);

    expect(report.passed).toBe(true);
    expect(report.requiresConfirmation).toBe(true);
  });
});
