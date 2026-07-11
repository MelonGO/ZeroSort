/**
 * Tests for sync slice state transitions around preview and safety confirmation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string) => key,
  },
}));

vi.mock("@/lib/actions", () => ({
  getDirectoriesAction: vi.fn(),
  getNotesAction: vi.fn(),
  getTagsAction: vi.fn(),
}));

vi.mock("@/lib/db/syncProfiles", () => ({
  getOrCreateActiveSyncProfile: vi.fn(),
}));

vi.mock("@/lib/db/syncRecords", () => ({
  clearSyncRecordsByProfile: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  connectS3Sync: vi.fn(),
  disconnectS3Sync: vi.fn(),
  performIncrementalSync: vi.fn(),
  previewIncrementalSync: vi.fn(),
}));

vi.mock("@/lib/sync/s3-config", () => ({
  deleteS3Config: vi.fn(),
  getS3Config: vi.fn(),
  saveS3Config: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import {
  getDirectoriesAction,
  getNotesAction,
  getTagsAction,
} from "@/lib/actions";
import { getOrCreateActiveSyncProfile } from "@/lib/db/syncProfiles";
import { clearSyncRecordsByProfile } from "@/lib/db/syncRecords";
import { performIncrementalSync, previewIncrementalSync } from "@/lib/sync";
import { toast } from "sonner";
import { createSyncSlice } from "../sync";

function createStoreState() {
  let state: any;
  const set = (partial: any) => {
    const update = typeof partial === "function" ? partial(state) : partial;
    state = {
      ...state,
      ...update,
    };
  };

  const get = () => state;
  const slice = createSyncSlice(set, get);

  state = {
    sortBy: "updatedAt",
    syncConcurrency: 5,
    syncFromDb: vi.fn(),
    ...slice,
  };

  state.syncStatus = {
    isConnected: true,
    connection: {
      id: "conn-1",
      bucket_name: "bucket-a",
      region: "us-east-1",
      endpoint_url: "https://s3.us-east-1.amazonaws.com",
    },
    isSyncing: false,
    lastSyncAt: null,
    lastError: null,
  };

  return {
    getState: () => state,
  };
}

describe("Sync Slice - Preview and Safety State", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    (getOrCreateActiveSyncProfile as any).mockResolvedValue({
      id: "profile-1",
      prefix: "zerosort/",
    });
    (getNotesAction as any).mockResolvedValue([]);
    (getDirectoriesAction as any).mockResolvedValue([]);
    (getTagsAction as any).mockResolvedValue([]);
  });

  it("Should replace stale preview data when sync is blocked by safety checks", async () => {
    const staleSummary = {
      totalItems: 3,
      uploadCount: 1,
      downloadCount: 1,
      localDeleteCount: 0,
      remoteDeleteCount: 0,
      conflictCount: 1,
      unsafeCount: 0,
      unchangedCount: 0,
    };
    const blockedSummary = {
      totalItems: 4,
      uploadCount: 0,
      downloadCount: 0,
      localDeleteCount: 2,
      remoteDeleteCount: 1,
      conflictCount: 0,
      unsafeCount: 1,
      unchangedCount: 1,
    };

    (performIncrementalSync as any).mockResolvedValue({
      success: false,
      blockedBySafety: true,
      safetyReport: {
        passed: false,
        checks: [],
        summary: blockedSummary,
        requiresConfirmation: true,
        confirmable: true,
      },
      errors: [],
    });

    const { getState } = createStoreState();
    getState().incrementalSync = {
      ...getState().incrementalSync,
      lastPreview: staleSummary,
      pendingSafetySync: {
        bucketName: "old-bucket",
        safetyReport: {
          passed: false,
          checks: [],
          summary: staleSummary,
          requiresConfirmation: true,
          confirmable: true,
        },
      },
    };

    const result = await getState().performSync("bucket-a");

    expect(result).toBe(false);
    expect(getState().incrementalSync.lastPreview).toEqual(blockedSummary);
    expect(getState().incrementalSync.pendingSafetySync).toEqual({
      bucketName: "bucket-a",
      safetyReport: {
        passed: false,
        checks: [],
        summary: blockedSummary,
        requiresConfirmation: true,
        confirmable: true,
      },
    });
    expect(getState().incrementalSync.lastError).toBe("sync.blockedBySafety");
  });

  it("Should clear stale safety dialog state after a successful preview", async () => {
    const previewSummary = {
      totalItems: 2,
      uploadCount: 1,
      downloadCount: 0,
      localDeleteCount: 0,
      remoteDeleteCount: 0,
      conflictCount: 0,
      unsafeCount: 0,
      unchangedCount: 1,
    };

    (previewIncrementalSync as any).mockResolvedValue({
      wouldBeBlocked: false,
      safetyReport: {
        passed: true,
        checks: [],
        summary: previewSummary,
        requiresConfirmation: false,
        confirmable: true,
      },
    });

    const { getState } = createStoreState();
    getState().incrementalSync = {
      ...getState().incrementalSync,
      pendingSafetySync: {
        bucketName: "stale-bucket",
        safetyReport: {
          passed: false,
          checks: [],
          summary: previewSummary,
          requiresConfirmation: true,
          confirmable: true,
        },
      },
    };

    const result = await getState().previewSync("bucket-a");

    expect(result).toEqual(previewSummary);
    expect(getState().incrementalSync.pendingSafetySync).toBeNull();
    expect(getState().incrementalSync.lastPreview).toEqual(previewSummary);
  });

  it("Should keep notes and directories fresh when only tags refresh fails", async () => {
    const notes = [{ id: "note-1" }];
    const directories = [{ id: "dir-1" }];

    (getNotesAction as any).mockResolvedValue(notes);
    (getDirectoriesAction as any).mockResolvedValue(directories);
    (getTagsAction as any).mockRejectedValue(new Error("tags failed"));

    const { getState } = createStoreState();

    const result = await getState().refreshAfterSync();

    expect(result).toEqual({ ok: true, failed: ["tags"] });
    expect(getState().syncFromDb).toHaveBeenCalledWith(
      notes,
      directories,
      undefined,
    );
  });

  it("Should report a critical refresh failure when notes cannot be reloaded", async () => {
    const directories = [{ id: "dir-1" }];

    (getNotesAction as any).mockRejectedValue(new Error("notes failed"));
    (getDirectoriesAction as any).mockResolvedValue(directories);
    (getTagsAction as any).mockResolvedValue([]);

    const { getState } = createStoreState();

    const result = await getState().refreshAfterSync();

    expect(result).toEqual({ ok: false, failed: ["notes"] });
    expect(getState().syncFromDb).not.toHaveBeenCalled();
  });

  it("Should warn when sync succeeds but tag refresh fails", async () => {
    (performIncrementalSync as any).mockResolvedValue({
      success: true,
      uploaded: 2,
      downloaded: 1,
      errors: [],
    });
    (getTagsAction as any).mockRejectedValue(new Error("tags failed"));

    const { getState } = createStoreState();

    const result = await getState().performSync("bucket-a");

    expect(result).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("sync.syncComplete");
    expect(toast.warning).toHaveBeenCalledWith("sync.refreshPartialTags", {
      position: "bottom-left",
    });
  });

  it("Should surface an error when sync succeeds but critical refresh data fails", async () => {
    (performIncrementalSync as any).mockResolvedValue({
      success: true,
      uploaded: 1,
      downloaded: 0,
      errors: [],
    });
    (getNotesAction as any).mockRejectedValue(new Error("notes failed"));

    const { getState } = createStoreState();

    const result = await getState().performSync("bucket-a");

    expect(result).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("sync.refreshFailed", {
      position: "bottom-left",
    });
  });

  it("Should apply degraded refresh handling after safety confirmation sync", async () => {
    (performIncrementalSync as any).mockResolvedValue({
      success: true,
      uploaded: 1,
      downloaded: 3,
      errors: [],
    });
    (getTagsAction as any).mockRejectedValue(new Error("tags failed"));

    const { getState } = createStoreState();
    getState().incrementalSync = {
      ...getState().incrementalSync,
      pendingSafetySync: {
        bucketName: "bucket-a",
        safetyReport: {
          passed: false,
          checks: [],
          summary: {
            totalItems: 1,
            uploadCount: 0,
            downloadCount: 0,
            localDeleteCount: 1,
            remoteDeleteCount: 0,
            conflictCount: 0,
            unsafeCount: 0,
            unchangedCount: 0,
          },
          requiresConfirmation: true,
          confirmable: true,
        },
      },
    };

    const result = await getState().confirmSyncDespiteSafety();

    expect(result).toBe(true);
    expect(toast.warning).toHaveBeenCalledWith("sync.refreshPartialTags", {
      position: "bottom-left",
    });
  });

  it("Should pass the active profile prefix into preview and sync operations", async () => {
    (previewIncrementalSync as any).mockResolvedValue({
      wouldBeBlocked: false,
      safetyReport: {
        passed: true,
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
        confirmable: true,
      },
    });
    (performIncrementalSync as any).mockResolvedValue({
      success: true,
      uploaded: 0,
      downloaded: 0,
      errors: [],
    });

    const { getState } = createStoreState();

    await getState().previewSync("bucket-a");
    await getState().performSync("bucket-a");

    expect(previewIncrementalSync).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "zerosort/",
      }),
    );
    expect(performIncrementalSync).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "zerosort/",
      }),
    );
  });

  it("Should surface a recovery block instead of opening the safety dialog", async () => {
    const blockedSummary = {
      totalItems: 4,
      uploadCount: 0,
      downloadCount: 0,
      localDeleteCount: 0,
      remoteDeleteCount: 4,
      conflictCount: 0,
      unsafeCount: 0,
      unchangedCount: 0,
    };

    (performIncrementalSync as any).mockResolvedValue({
      success: false,
      blockedBySafety: true,
      safetyReport: {
        passed: false,
        checks: [
          {
            code: "unexpected_empty_local",
            passed: false,
            severity: "danger",
            warning: "Local appears empty - all remote items would be deleted",
            details: "This may indicate a fresh install or database reset",
          },
        ],
        summary: blockedSummary,
        requiresConfirmation: true,
        confirmable: false,
      },
      errors: [],
    });

    const { getState } = createStoreState();
    const result = await getState().performSync("bucket-a");

    expect(result).toBe(false);
    expect(getState().incrementalSync.pendingSafetySync).toBeNull();
    expect(getState().incrementalSync.blockingSafetySync).toEqual({
      bucketName: "bucket-a",
      safetyReport: expect.objectContaining({
        confirmable: false,
      }),
    });
  });

  it("Should recover from remote using pull-only sync after clearing sync records", async () => {
    (performIncrementalSync as any).mockResolvedValue({
      success: true,
      uploaded: 0,
      downloaded: 2,
      errors: [],
    });

    const { getState } = createStoreState();
    const result = await getState().recoverFromRemote("bucket-a");

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
    expect(performIncrementalSync).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: "zerosort/",
        syncDirection: "pull_only",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("sync.recoveryComplete");
  });
});
