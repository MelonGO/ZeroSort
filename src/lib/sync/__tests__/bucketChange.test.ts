/**
 * Tests for bucket change detection logic.
 * Verifies that switching S3 buckets or endpoints correctly clears
 * stale sync records to prevent incorrect local file deletions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock DB modules (must be before imports that use them)
vi.mock("@/lib/db/syncProfiles", () => ({
  getSyncProfileById: vi.fn(),
  updateSyncProfile: vi.fn(),
}));

vi.mock("@/lib/db/syncRecords", () => ({
  clearSyncRecordsByProfile: vi.fn(),
  getSyncRecordsByProfile: vi.fn().mockResolvedValue([]),
  upsertSyncRecord: vi.fn(),
  deleteSyncRecord: vi.fn(),
  deleteSyncRecordsByEntityIds: vi.fn(),
}));

vi.mock("@/lib/db/notes", () => ({
  getAllNotesWithContent: vi.fn(),
  saveNote: vi.fn(),
  deleteNoteFromDb: vi.fn(),
}));

vi.mock("@/lib/db/directories", () => ({
  getAllDirectories: vi.fn(),
  saveDirectory: vi.fn(),
  deleteDirectoryFromDb: vi.fn(),
}));

vi.mock("@/lib/db/tags", () => ({
  getAllTags: vi.fn(),
  saveTag: vi.fn(),
  deleteTagFromDb: vi.fn(),
}));

vi.mock("@/lib/db/syncLogs", () => ({
  createSyncLog: vi.fn().mockResolvedValue("log-123"),
  updateSyncLogPlan: vi.fn(),
  completeSyncLog: vi.fn(),
  failSyncLog: vi.fn(),
}));

vi.mock("../s3", () => ({
  listSyncObjects: vi.fn(),
  uploadSyncObject: vi.fn(),
  downloadSyncObject: vi.fn(),
  deleteSyncObjectsBatch: vi.fn(),
}));

vi.mock("@/lib/desktop-adapter", () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  isDesktop: () => true,
  convertFileSrc: (p: string) => p,
  appDataDir: vi.fn().mockResolvedValue("/tmp/test-data"),
  joinPath: (...segments: string[]) => Promise.resolve(segments.join("/")),
  onIpcEvent: () => () => {},
}));

vi.mock("@/lib/credentials", () => ({
  getSyncEncryptionPassword: vi
    .fn()
    .mockResolvedValue("test-encryption-password"),
}));

import { getAllDirectories } from "@/lib/db/directories";
import { getAllNotesWithContent } from "@/lib/db/notes";
import { getSyncProfileById, updateSyncProfile } from "@/lib/db/syncProfiles";
import {
  clearSyncRecordsByProfile,
  getSyncRecordsByProfile,
} from "@/lib/db/syncRecords";
import { getAllTags } from "@/lib/db/tags";
import {
  detectAndHandleBucketChange,
  hasBucketIdentityChanged,
  previewIncrementalSync,
  recordSyncedBucketIdentity,
} from "../orchestrator";
import { listSyncObjects } from "../s3";

describe("Bucket Change Detection - detectAndHandleBucketChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing sync records
    (getSyncRecordsByProfile as any).mockResolvedValue([]);
  });

  it("Should return false when profile does not exist", async () => {
    (getSyncProfileById as any).mockResolvedValue(undefined);

    const result = await detectAndHandleBucketChange("profile-1", "new-bucket");

    expect(result).toBe(false);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });

  it("Should return false on first sync (no lastSyncedBucketName, no records)", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: undefined,
      lastSyncedEndpointUrl: undefined,
    });
    (getSyncRecordsByProfile as any).mockResolvedValue([]);

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "my-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(result).toBe(false);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });

  it("Should return false when bucket and endpoint are unchanged", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: "my-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "my-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(result).toBe(false);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });

  it("Should detect bucket name change and clear sync records", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "new-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: "old-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "new-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
  });

  it("Should detect endpoint URL change and clear sync records (provider migration)", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://minio.example.com",
      lastSyncedBucketName: "my-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "my-bucket",
      "https://minio.example.com",
    );

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
  });

  it("Should detect both bucket and endpoint change simultaneously", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "new-bucket",
      endpointUrl: "https://r2.cloudflarestorage.com",
      lastSyncedBucketName: "old-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "new-bucket",
      "https://r2.cloudflarestorage.com",
    );

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
    expect(clearSyncRecordsByProfile).toHaveBeenCalledTimes(1);
  });

  it("Should not detect endpoint change when endpointUrl is not provided", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://minio.example.com",
      lastSyncedBucketName: "my-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });

    // When endpointUrl is not provided, only bucket name is compared
    const result = await detectAndHandleBucketChange("profile-1", "my-bucket");

    expect(result).toBe(false);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });

  it("Should not detect endpoint change when lastSyncedEndpointUrl is not set", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://minio.example.com",
      lastSyncedBucketName: "my-bucket",
      lastSyncedEndpointUrl: undefined,
    });

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "my-bucket",
      "https://minio.example.com",
    );

    expect(result).toBe(false);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });
});

describe("Bucket Change Detection - Upgrade Path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should detect bucket change on upgrade (null lastSyncedBucketName + existing records + different bucket)", async () => {
    // Simulates: user upgraded from pre-fix version, then changed bucket
    // Profile still has old bucketName from DB, but user is now syncing to new bucket
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "old-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: undefined,
      lastSyncedEndpointUrl: undefined,
    });
    // Existing sync records prove this is NOT a first sync
    (getSyncRecordsByProfile as any).mockResolvedValue([
      { entityId: "note-1", profileId: "profile-1" },
      { entityId: "note-2", profileId: "profile-1" },
    ]);

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "new-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
  });

  it("Should detect endpoint change on upgrade (null lastSyncedBucketName + existing records + different endpoint)", async () => {
    // Simulates: user upgraded from pre-fix version, then migrated to different provider
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: undefined,
      lastSyncedEndpointUrl: undefined,
    });
    (getSyncRecordsByProfile as any).mockResolvedValue([
      { entityId: "note-1", profileId: "profile-1" },
    ]);

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "my-bucket",
      "https://minio.example.com",
    );

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
  });

  it("Should not clear records on upgrade when bucket and endpoint are unchanged", async () => {
    // Simulates: user upgraded from pre-fix version, but hasn't changed anything
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "my-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: undefined,
      lastSyncedEndpointUrl: undefined,
    });
    (getSyncRecordsByProfile as any).mockResolvedValue([
      { entityId: "note-1", profileId: "profile-1" },
      { entityId: "note-2", profileId: "profile-1" },
    ]);

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "my-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(result).toBe(false);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });

  it("Should detect both bucket and endpoint change on upgrade", async () => {
    // Simulates: user upgraded, then switched to completely different provider + bucket
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "old-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: undefined,
      lastSyncedEndpointUrl: undefined,
    });
    (getSyncRecordsByProfile as any).mockResolvedValue([
      { entityId: "note-1", profileId: "profile-1" },
    ]);

    const result = await detectAndHandleBucketChange(
      "profile-1",
      "new-bucket",
      "https://r2.cloudflarestorage.com",
    );

    expect(result).toBe(true);
    expect(clearSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
    expect(clearSyncRecordsByProfile).toHaveBeenCalledTimes(1);
  });
});

describe("Bucket Change Detection - Read-only Checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSyncRecordsByProfile as any).mockResolvedValue([]);
    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllDirectories as any).mockResolvedValue([]);
    (getAllTags as any).mockResolvedValue([]);
    (listSyncObjects as any).mockResolvedValue([]);
  });

  it("Should detect bucket changes without clearing sync records", async () => {
    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "new-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: "old-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });

    const changed = await hasBucketIdentityChanged(
      "profile-1",
      "new-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(changed).toBe(true);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });

  it("Should preview a changed bucket as a fresh sync without mutating records", async () => {
    const now = new Date().toISOString();

    (getSyncProfileById as any).mockResolvedValue({
      id: "profile-1",
      bucketName: "new-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      lastSyncedBucketName: "old-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });
    (getSyncRecordsByProfile as any).mockResolvedValue([
      {
        entityId: "note-1",
        entityType: "note",
        key: "notes/note-1.json",
        localMtime: new Date(now).getTime(),
        remoteMtime: new Date(now).getTime(),
        size: 100,
        etag: '"etag-1"',
        profileId: "profile-1",
      },
    ]);
    (getAllNotesWithContent as any).mockResolvedValue([
      {
        id: "note-1",
        title: "Local note",
        content: "Fresh local content",
        updatedAt: now,
        createdAt: now,
      },
    ]);

    const preview = await previewIncrementalSync({
      profileId: "profile-1",
      connectionId: "conn-1",
      bucketName: "new-bucket",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      prefix: "zerosort/",
    });

    expect(preview.wouldBeBlocked).toBe(false);
    expect(preview.plan.uploads).toHaveLength(1);
    expect(preview.plan.remoteDeletes).toHaveLength(0);
    expect(clearSyncRecordsByProfile).not.toHaveBeenCalled();
  });
});

describe("Bucket Change Detection - recordSyncedBucketIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should record bucket name and endpoint URL after successful sync", async () => {
    await recordSyncedBucketIdentity(
      "profile-1",
      "my-bucket",
      "https://s3.us-east-1.amazonaws.com",
    );

    expect(updateSyncProfile).toHaveBeenCalledWith("profile-1", {
      lastSyncedBucketName: "my-bucket",
      lastSyncedEndpointUrl: "https://s3.us-east-1.amazonaws.com",
    });
  });

  it("Should record only bucket name when endpoint is not provided", async () => {
    await recordSyncedBucketIdentity("profile-1", "my-bucket");

    expect(updateSyncProfile).toHaveBeenCalledWith("profile-1", {
      lastSyncedBucketName: "my-bucket",
    });
  });
});
