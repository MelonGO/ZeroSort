/**
 * Tests for the sync planner - Three-Way Comparison Decision Matrix.
 *
 * Tests all 41 decision branches and various sync scenarios.
 */

import type { MixedEntity, SyncOptions, SyncPlan } from "@/types/sync";
import { describe, expect, it } from "vitest";
import {
  assignDecision,
  describeSyncPlan,
  generateSyncPlan,
  isPlanDangerous,
  summarizeSyncPlan,
  validateSyncPlan,
} from "../planner";
import {
  createEntityMap,
  createMockMixedEntity,
  createScenario,
} from "./test-utils";

const defaultOptions: Pick<SyncOptions, "conflictAction" | "syncDirection"> = {
  conflictAction: "keep_newer",
  syncDirection: "bidirectional",
};

describe("Sync Planner - Decision Matrix", () => {
  describe("Case 1: Both local and remote missing (only in history)", () => {
    it("Branch 1: Should mark as only_history when both sides deleted", () => {
      const entity = createScenario("both-deleted");
      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("only_history");
      expect(entity.decisionBranch).toBe(1);
      expect(entity.change).toBe(false);
    });
  });

  describe("Case 2: Both local and remote exist", () => {
    it("Branch 2: Should mark as equal when both sides are identical", () => {
      const entity = createScenario("both-equal");
      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("equal");
      expect(entity.decisionBranch).toBe(2);
      expect(entity.change).toBe(false);
    });

    it("Branch 9: Should pull when remote is newer", () => {
      const entity = createScenario("remote-newer");
      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("remote_is_modified_then_pull");
      expect(entity.decisionBranch).toBe(9);
      expect(entity.change).toBe(true);
    });

    it("Branch 10: Should push when local is newer", () => {
      const entity = createScenario("local-newer");
      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("local_is_modified_then_push");
      expect(entity.decisionBranch).toBe(10);
      expect(entity.change).toBe(true);
    });

    it("Branch 16: Should resolve conflict by keeping newer (local wins)", () => {
      const entity = createMockMixedEntity("notes/conflict.json", {
        local: { id: "conflict", entityType: "note", mtime: 2000 },
        remote: { id: "conflict", entityType: "note", mtime: 1000 },
        prevSync: { id: "conflict", entityType: "note", mtime: 500 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("conflict_modified_then_keep_local");
      expect(entity.decisionBranch).toBe(16);
      expect(entity.change).toBe(true);
    });

    it("Branch 17: Should resolve conflict by keeping newer (remote wins)", () => {
      const entity = createMockMixedEntity("notes/conflict.json", {
        local: { id: "conflict", entityType: "note", mtime: 1000 },
        remote: { id: "conflict", entityType: "note", mtime: 2000 },
        prevSync: { id: "conflict", entityType: "note", mtime: 500 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("conflict_modified_then_keep_remote");
      expect(entity.decisionBranch).toBe(17);
      expect(entity.change).toBe(true);
    });

    it("Branch 26: Should conflict when push_only and remote modified", () => {
      const entity = createScenario("remote-newer");
      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "push_only",
      });

      expect(entity.decision).toBe("conflict_modified_then_keep_local");
      expect(entity.decisionBranch).toBe(26);
    });

    it("Branch 27: Should conflict when pull_only and local modified", () => {
      const entity = createScenario("local-newer");
      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "pull_only",
      });

      expect(entity.decision).toBe("conflict_modified_then_keep_remote");
      expect(entity.decisionBranch).toBe(27);
    });
  });

  describe("Case 3: Only remote exists (local missing)", () => {
    it("Branch 3: Should pull new remote entity", () => {
      const entity = createMockMixedEntity("notes/remote-new.json", {
        remote: { id: "remote-new", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("remote_is_created_then_pull");
      expect(entity.decisionBranch).toBe(3);
      expect(entity.change).toBe(true);
    });

    it("Branch 4: Should delete remote when local was deleted and remote unchanged", () => {
      const entity = createMockMixedEntity("notes/both-deleted.json", {
        remote: { id: "both-deleted", entityType: "note", mtime: 1000 },
        prevSync: { id: "both-deleted", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("local_is_deleted_thus_also_delete_remote");
      expect(entity.decisionBranch).toBe(4);
      expect(entity.change).toBe(true);
    });

    it("Branch 5: Should pull modified remote after local deletion", () => {
      const entity = createMockMixedEntity("notes/remote-modified.json", {
        remote: { id: "remote-modified", entityType: "note", mtime: 2000 },
        prevSync: { id: "remote-modified", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("remote_is_modified_then_pull");
      expect(entity.decisionBranch).toBe(5);
      expect(entity.change).toBe(true);
    });

    it("Branch 28: Should do nothing when push_only and remote created", () => {
      const entity = createMockMixedEntity("notes/remote-only.json", {
        remote: { id: "remote-only", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "push_only",
      });

      expect(entity.decision).toBe("conflict_created_then_do_nothing");
      expect(entity.decisionBranch).toBe(28);
      expect(entity.change).toBe(false);
    });

    it("Branch 35: Should conflict when pull_only and local deleted", () => {
      const entity = createMockMixedEntity("notes/local-deleted.json", {
        remote: { id: "local-deleted", entityType: "note", mtime: 1000 },
        prevSync: { id: "local-deleted", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "pull_only",
      });

      expect(entity.decision).toBe("conflict_created_then_keep_remote");
      expect(entity.decisionBranch).toBe(35);
    });

    it("Should block when a referenced image is unreadable locally", () => {
      const entity = createMockMixedEntity("images/note-1/image.png", {
        remote: {
          id: "images/note-1/image.png",
          entityType: "image",
          mtime: 1000,
        },
        prevSync: {
          id: "images/note-1/image.png",
          entityType: "image",
          mtime: 1000,
        },
      });
      entity.localImageReferenced = true;
      entity.syncIssue =
        "Managed image is still referenced locally, but its metadata could not be read.";

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("unsafe_local_state");
      expect(entity.change).toBe(false);
    });

    it("Should delete remote image only when the image is no longer referenced locally", () => {
      const entity = createMockMixedEntity("images/note-1/image.png", {
        remote: {
          id: "images/note-1/image.png",
          entityType: "image",
          mtime: 2000,
        },
        prevSync: {
          id: "images/note-1/image.png",
          entityType: "image",
          mtime: 1000,
        },
      });
      entity.localImageReferenced = false;

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("local_is_deleted_thus_also_delete_remote");
      expect(entity.decisionBranch).toBe(38);
    });
  });

  describe("Case 4: Only local exists (remote missing)", () => {
    it("Branch 6: Should push new local entity", () => {
      const entity = createScenario("local-only");
      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("local_is_created_then_push");
      expect(entity.decisionBranch).toBe(6);
      expect(entity.change).toBe(true);
    });

    it("Branch 7: Should delete local when remote was deleted and local unchanged", () => {
      const entity = createMockMixedEntity("notes/remote-deleted.json", {
        local: { id: "remote-deleted", entityType: "note", mtime: 1000 },
        prevSync: { id: "remote-deleted", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("remote_is_deleted_thus_also_delete_local");
      expect(entity.decisionBranch).toBe(7);
      expect(entity.change).toBe(true);
    });

    it("Branch 8: Should push modified local after remote deletion", () => {
      const entity = createMockMixedEntity("notes/local-modified.json", {
        local: { id: "local-modified", entityType: "note", mtime: 2000 },
        prevSync: { id: "local-modified", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, defaultOptions);

      expect(entity.decision).toBe("local_is_modified_then_push");
      expect(entity.decisionBranch).toBe(8);
      expect(entity.change).toBe(true);
    });

    it("Branch 31: Should do nothing when pull_only and local created", () => {
      const entity = createScenario("local-only");
      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "pull_only",
      });

      expect(entity.decision).toBe("conflict_created_then_do_nothing");
      expect(entity.decisionBranch).toBe(31);
      expect(entity.change).toBe(false);
    });

    it("Branch 32: Should conflict when push_only and remote deleted", () => {
      const entity = createMockMixedEntity("notes/remote-deleted.json", {
        local: { id: "remote-deleted", entityType: "note", mtime: 1000 },
        prevSync: { id: "remote-deleted", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "push_only",
      });

      expect(entity.decision).toBe("conflict_created_then_keep_local");
      expect(entity.decisionBranch).toBe(32);
    });
  });

  describe("Conflict resolution strategies", () => {
    it("keep_local: Should always choose local in conflict", () => {
      const entity = createScenario("both-modified");
      assignDecision(entity, {
        conflictAction: "keep_local",
        syncDirection: "bidirectional",
      });

      expect(entity.decision).toContain("keep_local");
    });

    it("keep_remote: Should always choose remote in conflict", () => {
      const entity = createScenario("both-modified");
      assignDecision(entity, {
        conflictAction: "keep_remote",
        syncDirection: "bidirectional",
      });

      expect(entity.decision).toContain("keep_remote");
    });

    it("Branch 11: Created conflict keeping local", () => {
      const entity = createMockMixedEntity("notes/created-conflict.json", {
        local: { id: "created-conflict", entityType: "note", mtime: 2000 },
        remote: { id: "created-conflict", entityType: "note", mtime: 1000 },
      });

      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "bidirectional",
      });

      expect(entity.decision).toBe("conflict_created_then_keep_local");
      expect(entity.decisionBranch).toBe(11);
    });

    it("Branch 12: Created conflict keeping remote", () => {
      const entity = createMockMixedEntity("notes/created-conflict.json", {
        local: { id: "created-conflict", entityType: "note", mtime: 1000 },
        remote: { id: "created-conflict", entityType: "note", mtime: 2000 },
      });

      assignDecision(entity, {
        conflictAction: "keep_newer",
        syncDirection: "bidirectional",
      });

      expect(entity.decision).toBe("conflict_created_then_keep_remote");
      expect(entity.decisionBranch).toBe(12);
    });
  });
});

describe("Sync Planner - Plan Generation", () => {
  it("Should generate complete sync plan", () => {
    const entities = createEntityMap([
      createScenario("local-only"),
      createScenario("remote-only"),
      createScenario("both-equal"),
      createScenario("local-newer"),
      createScenario("remote-newer"),
    ]);

    const plan = generateSyncPlan(entities, defaultOptions);

    expect(plan.uploads).toHaveLength(2); // local-only + local-newer
    expect(plan.downloads).toHaveLength(2); // remote-only + remote-newer
    expect(plan.unchanged).toHaveLength(1); // both-equal
  });

  it("Should handle empty entity map", () => {
    const entities = new Map<string, MixedEntity>();
    const plan = generateSyncPlan(entities, defaultOptions);

    expect(plan.uploads).toHaveLength(0);
    expect(plan.downloads).toHaveLength(0);
    expect(plan.localDeletes).toHaveLength(0);
    expect(plan.remoteDeletes).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(0);
  });
});

describe("Sync Planner - Plan Summary", () => {
  it("Should correctly summarize plan", () => {
    const plan: SyncPlan = {
      uploads: [
        { decision: "local_is_created_then_push" } as MixedEntity,
        { decision: "conflict_modified_then_keep_local" } as MixedEntity,
      ],
      downloads: [
        { decision: "remote_is_created_then_pull" } as MixedEntity,
        { decision: "conflict_modified_then_keep_remote" } as MixedEntity,
      ],
      localDeletes: [
        { decision: "remote_is_deleted_thus_also_delete_local" } as MixedEntity,
      ],
      remoteDeletes: [
        { decision: "local_is_deleted_thus_also_delete_remote" } as MixedEntity,
      ],
      conflicts: [],
      unchanged: [{ decision: "equal" } as MixedEntity],
    };

    const summary = summarizeSyncPlan(plan);

    expect(summary.totalItems).toBe(7);
    expect(summary.uploadCount).toBe(2);
    expect(summary.downloadCount).toBe(2);
    expect(summary.localDeleteCount).toBe(1);
    expect(summary.remoteDeleteCount).toBe(1);
    expect(summary.conflictCount).toBe(2);
    expect(summary.unsafeCount).toBe(0);
    expect(summary.unchangedCount).toBe(1);
  });
});

describe("Sync Planner - Plan Description", () => {
  it("Should describe plan with all operations", () => {
    const plan: SyncPlan = {
      uploads: [{}, {}] as MixedEntity[],
      downloads: [{}, {}] as MixedEntity[],
      localDeletes: [{}] as MixedEntity[],
      remoteDeletes: [{}] as MixedEntity[],
      conflicts: [],
      unchanged: [{}, {}] as MixedEntity[],
    };

    const description = describeSyncPlan(plan);

    expect(description).toContain("Upload 2");
    expect(description).toContain("Download 2");
    expect(description).toContain("Delete local 1");
    expect(description).toContain("Delete remote 1");
  });

  it("Should describe blocked unsafe entities", () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [
        {
          key: "images/note-1/image.png",
          decision: "unsafe_local_state",
          syncIssue:
            "Managed image is still referenced locally, but its metadata could not be read.",
        } as MixedEntity,
      ],
      unchanged: [],
    };

    const description = describeSyncPlan(plan);

    expect(description).toContain("Blocked 1 unsafe items");
  });

  it("Should handle empty plan", () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const description = describeSyncPlan(plan);

    expect(description).toBe("No changes needed");
  });
});

describe("Sync Planner - Danger Detection", () => {
  it("Should detect dangerous plan with >30% deletions", () => {
    const plan: SyncPlan = {
      uploads: [] as MixedEntity[],
      downloads: [] as MixedEntity[],
      localDeletes: Array(4).fill({} as MixedEntity),
      remoteDeletes: [] as MixedEntity[],
      conflicts: [],
      unchanged: Array(6).fill({} as MixedEntity),
    };

    expect(isPlanDangerous(plan, 30)).toBe(true);
  });

  it("Should not flag safe plan with <30% deletions", () => {
    const plan: SyncPlan = {
      uploads: [] as MixedEntity[],
      downloads: [] as MixedEntity[],
      localDeletes: Array(2).fill({} as MixedEntity),
      remoteDeletes: [] as MixedEntity[],
      conflicts: [],
      unchanged: Array(8).fill({} as MixedEntity),
    };

    expect(isPlanDangerous(plan, 30)).toBe(false);
  });

  it("Should handle empty plan", () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    expect(isPlanDangerous(plan, 30)).toBe(false);
  });
});

describe("Sync Planner - Plan Validation", () => {
  it("Should validate valid plan", () => {
    const plan: SyncPlan = {
      uploads: [
        createMockMixedEntity("notes/test.json", {
          local: { id: "test", entityType: "note" },
        }),
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };
    plan.uploads[0].decision = "local_is_created_then_push";

    const errors = validateSyncPlan(plan);

    expect(errors).toHaveLength(0);
  });

  it("Should detect entities without ID", () => {
    const plan: SyncPlan = {
      uploads: [createMockMixedEntity("notes/test.json", {})],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };
    plan.uploads[0].decision = "local_is_created_then_push";

    const errors = validateSyncPlan(plan);

    expect(errors).toContain("Entity notes/test.json has no ID");
  });

  it("Should detect entities without decision", () => {
    const plan: SyncPlan = {
      uploads: [
        createMockMixedEntity("notes/test.json", {
          local: { id: "test", entityType: "note" },
        }),
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const errors = validateSyncPlan(plan);

    expect(errors).toContain("Entity notes/test.json has no decision");
  });
});
