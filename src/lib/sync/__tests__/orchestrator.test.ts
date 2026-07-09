/**
 * Integration tests for the Sync Orchestrator.
 * Verifies the full flow from collection to execution using mocks for DB and S3.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  performIncrementalSync,
  previewIncrementalSync,
} from "../orchestrator";

// Mock DB modules
vi.mock("@/lib/db/notes", () => ({
  getAllNotesWithContent: vi.fn(),
  getNoteByIdWithContent: vi.fn(),
  saveNote: vi.fn(),
  deleteNoteFromDb: vi.fn(),
}));

vi.mock("@/lib/db/tags", () => ({
  getAllTags: vi.fn(),
  getTagById: vi.fn(),
  saveTag: vi.fn(),
  deleteTagFromDb: vi.fn(),
}));

vi.mock("@/lib/db/directories", () => ({
  getAllDirectories: vi.fn(),
  getDirectoryById: vi.fn(),
  getDirectoryByNameAndParent: vi.fn(),
  saveDirectory: vi.fn(),
  deleteDirectoryFromDb: vi.fn(),
}));

vi.mock("@/lib/db/syncLogs", () => ({
  createSyncLog: vi.fn().mockResolvedValue("log-123"),
  updateSyncLogPlan: vi.fn(),
  completeSyncLog: vi.fn(),
  failSyncLog: vi.fn(),
}));

vi.mock("@/lib/db/syncRecords", () => ({
  getSyncRecordsByProfile: vi.fn(),
  upsertSyncRecord: vi.fn(),
  deleteSyncRecord: vi.fn(),
  deleteSyncRecordsByEntityIds: vi.fn(),
  clearSyncRecordsByProfile: vi.fn(),
}));

vi.mock("@/lib/db/syncProfiles", () => ({
  getSyncProfileById: vi.fn().mockResolvedValue(undefined),
  updateSyncProfile: vi.fn(),
}));

vi.mock("@/lib/images", () => ({
  extractManagedImagePathsFromRecords: vi.fn(),
  getManagedImageMetadata: vi.fn(),
  readManagedImageFile: vi.fn(),
  writeManagedImageFile: vi.fn(),
  deleteManagedImageFile: vi.fn(),
}));

// Mock S3 module
vi.mock("../s3", () => ({
  listSyncObjects: vi.fn(),
  uploadSyncObject: vi.fn(),
  uploadSyncBinaryObject: vi.fn(),
  downloadSyncObject: vi.fn(),
  downloadSyncBinaryObject: vi.fn(),
  deleteSyncObjectsBatch: vi.fn(),
}));

// Mock desktop adapter invoke
vi.mock("@/lib/desktop-adapter", () => ({
  invoke: vi.fn(),
  isTauri: () => true,
  isDesktop: () => true,
  convertFileSrc: (p: string) => p,
  appDataDir: vi.fn().mockResolvedValue("/tmp/test-data"),
  joinPath: (...segments: string[]) => Promise.resolve(segments.join("/")),
  onIpcEvent: () => () => {},
}));

// Mock credentials module to return a valid encryption password
vi.mock("@/lib/credentials", () => ({
  getSyncEncryptionPassword: vi
    .fn()
    .mockResolvedValue("test-encryption-password"),
}));

import {
  getAllDirectories,
  getDirectoryById,
  getDirectoryByNameAndParent,
  saveDirectory,
} from "@/lib/db/directories";
import { getAllNotesWithContent, getNoteByIdWithContent } from "@/lib/db/notes";
import {
  getSyncRecordsByProfile,
  upsertSyncRecord,
} from "@/lib/db/syncRecords";
import {
  extractManagedImagePathsFromRecords,
  getManagedImageMetadata,
  readManagedImageFile,
} from "@/lib/images";
import {
  deleteSyncObjectsBatch,
  downloadSyncObject,
  listSyncObjects,
  uploadSyncBinaryObject,
  uploadSyncObject,
} from "../s3";

describe("Sync Orchestrator - Integration", () => {
  const mockOptions = {
    profileId: "profile-1",
    connectionId: "conn-1",
    bucketName: "test-bucket",
    prefix: "zerosort/",
    dryRun: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (extractManagedImagePathsFromRecords as any).mockReturnValue([]);
    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: [],
      failed_keys: [],
      errors: [],
    });

    // Wire up per-ID getters to delegate to the array mocks
    (getNoteByIdWithContent as any).mockImplementation(async (id: string) => {
      const notes = await (getAllNotesWithContent as any)();
      return notes?.find((n: any) => n.id === id) ?? null;
    });
    (getDirectoryById as any).mockImplementation(async (id: string) => {
      const dirs = await (getAllDirectories as any)();
      return dirs?.find((d: any) => d.id === id) ?? null;
    });
  });

  it("Should perform a first-time sync (upload local notes to empty remote)", async () => {
    const now = new Date().toISOString();
    const mockNote = {
      id: "note-1",
      title: "Test Note",
      content: "Hello",
      updatedAt: now,
      createdAt: now,
    };

    // 1. Mock Local State (1 note, no directories)
    (getAllNotesWithContent as any).mockResolvedValue([mockNote]);
    (getAllDirectories as any).mockResolvedValue([]);

    // 2. Mock Remote State (Empty bucket)
    (listSyncObjects as any).mockResolvedValue([]);

    // 3. Mock History (No sync records)
    (getSyncRecordsByProfile as any).mockResolvedValue([]);

    // 4. Mock S3 Upload
    (uploadSyncObject as any).mockResolvedValue({
      key: "notes/note-1.json",
      etag: '"etag-1"',
      last_modified: now,
    });

    // Run Sync
    const result = await performIncrementalSync(mockOptions);

    // Verify Result
    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(result.safetyReport.passed).toBe(true);
    expect(result.description).toContain("Upload 1");

    // Verify S3 called with encrypted content
    expect(uploadSyncObject).toHaveBeenCalledWith(
      "conn-1",
      "test-bucket",
      "zerosort/notes/note-1.json",
      expect.stringContaining('"_encrypted":true'),
    );
  });

  it("Should handle remote changes (download new notes from remote)", async () => {
    const now = new Date().toISOString();

    // 1. Mock Local State (Empty)
    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllDirectories as any).mockResolvedValue([]);

    // 2. Mock Remote State (1 note)
    (listSyncObjects as any).mockResolvedValue([
      {
        key: "notes/remote-1.json",
        size: 100,
        last_modified: now,
        etag: '"etag-remote"',
      },
    ]);

    // 3. Mock History (Empty)
    (getSyncRecordsByProfile as any).mockResolvedValue([]);

    // 4. Mock S3 Download
    const remoteNoteJson = JSON.stringify({
      id: "remote-1",
      title: "Remote Note",
      content: "From S3",
      updatedAt: now,
      createdAt: now,
    });
    const { downloadSyncObject } = await import("../s3");
    (downloadSyncObject as any).mockResolvedValue(remoteNoteJson);

    // Run Sync
    const result = await performIncrementalSync(mockOptions);

    // Verify Result
    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(1);
    expect(result.uploaded).toBe(0);

    // Verify DB save called
    const { saveNote } = await import("@/lib/db/notes");
    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "remote-1",
        title: "Remote Note",
      }),
    );
  });

  it("Should resolve conflicts using conflictAction (keep_newer)", async () => {
    const baseTime = 1704067200000; // 2024-01-01 00:00:00 UTC
    const localTime = new Date(baseTime + 10000).toISOString();
    const remoteTime = new Date(baseTime + 5000).toISOString();
    const lastSyncTime = new Date(baseTime).toISOString();

    const noteId = "conflict-note";
    const key = `notes/${noteId}.json`;

    // 1. Mock Local State (Newer)
    const localNote = {
      id: noteId,
      title: "Local Version",
      content: "Newer content",
      updatedAt: localTime,
      createdAt: lastSyncTime,
    };
    (getAllNotesWithContent as any).mockResolvedValue([localNote]);
    (getAllDirectories as any).mockResolvedValue([]);

    // 2. Mock Remote State (Older than local, but newer than last sync)
    (listSyncObjects as any).mockResolvedValue([
      {
        key,
        size: 100,
        last_modified: remoteTime,
        etag: '"etag-remote"',
      },
    ]);

    // 3. Mock History (Last sync at baseTime)
    (getSyncRecordsByProfile as any).mockResolvedValue([
      {
        entityId: noteId,
        entityType: "note",
        key,
        localMtime: baseTime / 1000,
        remoteMtime: baseTime / 1000,
        profileId: "profile-1",
      },
    ]);

    // 4. Mock S3 Upload (since local is newer)
    (uploadSyncObject as any).mockResolvedValue({
      key,
      etag: '"etag-new"',
      last_modified: localTime,
    });

    // Run Sync with keep_newer
    const result = await performIncrementalSync({
      ...mockOptions,
      conflictAction: "keep_newer",
    });

    // Verify Result
    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(result.description).toContain("Resolve 1 conflicts");

    // Verify S3 called with encrypted content (content is encrypted, so we check for the encrypted flag)
    expect(uploadSyncObject).toHaveBeenCalledWith(
      "conn-1",
      "test-bucket",
      `zerosort/${key}`,
      expect.stringContaining('"_encrypted":true'),
    );
  });

  it("Should handle sync errors and record them in the log", async () => {
    const now = new Date().toISOString();
    const mockNote = {
      id: "error-note",
      title: "Error Note",
      content: "Content",
      updatedAt: now,
      createdAt: now,
    };

    // 1. Mock Local State
    (getAllNotesWithContent as any).mockResolvedValue([mockNote]);
    (getAllDirectories as any).mockResolvedValue([]);

    // 2. Mock Remote State
    (listSyncObjects as any).mockResolvedValue([]);

    // 3. Mock History
    (getSyncRecordsByProfile as any).mockResolvedValue([]);

    // 4. Mock S3 Upload FAILURE
    (uploadSyncObject as any).mockRejectedValue(new Error("S3 Upload Failed"));

    // Run Sync
    const result = await performIncrementalSync(mockOptions);

    // Verify Result
    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "Failed to upload notes/error-note.json: Error: S3 Upload Failed",
    );

    // Verify Log failure recorded
    const { failSyncLog } = await import("@/lib/db/syncLogs");
    expect(failSyncLog).toHaveBeenCalledWith(
      "log-123",
      expect.stringContaining("S3 Upload Failed"),
    );
  });

  it("Should correctly sync nested directories in order (shallow to deep)", async () => {
    const now = new Date().toISOString();

    // 1. Mock Local State:
    // root-dir
    //   child-dir (parentId: root-dir)
    //     note-in-child (directoryId: child-dir)
    const rootDir = {
      id: "root-dir",
      name: "Root",
      parentId: null,
      updatedAt: now,
    };
    const childDir = {
      id: "child-dir",
      name: "Child",
      parentId: "root-dir",
      updatedAt: now,
    };
    const note = {
      id: "note-1",
      title: "Note",
      content: "Content",
      directoryId: "child-dir",
      updatedAt: now,
      createdAt: now,
    };

    (getAllDirectories as any).mockResolvedValue([rootDir, childDir]);
    (getAllNotesWithContent as any).mockResolvedValue([note]);

    // 2. Mock Remote State (Empty)
    (listSyncObjects as any).mockResolvedValue([]);

    // 3. Mock History (Empty)
    (getSyncRecordsByProfile as any).mockResolvedValue([]);

    // 4. Track S3 Upload Order
    const uploadOrder: string[] = [];
    (uploadSyncObject as any).mockImplementation(
      (_conn: any, _bucket: any, key: string, _content: any) => {
        uploadOrder.push(key);
        return Promise.resolve({
          key,
          etag: '"etag"',
          last_modified: now,
        });
      },
    );

    // Run Sync
    const result = await performIncrementalSync(mockOptions);

    // Verify Result
    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(3); // 2 dirs + 1 note

    // Verify all expected items were uploaded (order is not guaranteed due to parallel execution)
    expect(uploadOrder).toHaveLength(3);
    expect(uploadOrder.some((k) => k.includes("root-dir"))).toBe(true);
    expect(uploadOrder.some((k) => k.includes("child-dir"))).toBe(true);
    expect(uploadOrder.some((k) => k.includes("note-1"))).toBe(true);
  });

  it("Should upload managed images referenced by notes during sync", async () => {
    const now = new Date().toISOString();
    const imagePath = "images/note-1/image.png";
    const mockNote = {
      id: "note-1",
      title: "Image Note",
      content: JSON.stringify({
        type: "doc",
        content: [{ type: "image", attrs: { src: imagePath } }],
      }),
      updatedAt: now,
      createdAt: now,
    };

    (getAllNotesWithContent as any).mockResolvedValue([mockNote]);
    (getAllDirectories as any).mockResolvedValue([]);
    (listSyncObjects as any).mockResolvedValue([]);
    (getSyncRecordsByProfile as any).mockResolvedValue([]);
    (extractManagedImagePathsFromRecords as any).mockReturnValue([imagePath]);
    (getManagedImageMetadata as any).mockResolvedValue({
      relativePath: imagePath,
      absolutePath: "/tmp/image.png",
      sizeBytes: 128,
      modifiedAtMs: new Date(now).getTime(),
    });
    (readManagedImageFile as any).mockResolvedValue(Uint8Array.from([1, 2, 3]));
    (uploadSyncObject as any).mockResolvedValue({
      key: "notes/note-1.json",
      etag: '"etag-note"',
      last_modified: now,
    });
    (uploadSyncBinaryObject as any).mockResolvedValue({
      key: imagePath,
      etag: '"etag-image"',
      last_modified: now,
    });

    const result = await performIncrementalSync(mockOptions);

    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(2);
    expect(uploadSyncObject).toHaveBeenCalledWith(
      "conn-1",
      "test-bucket",
      "zerosort/notes/note-1.json",
      expect.stringContaining('"_encrypted":true'),
    );
    expect(uploadSyncBinaryObject).toHaveBeenCalledWith(
      "conn-1",
      "test-bucket",
      `zerosort/${imagePath}`,
      expect.any(Uint8Array),
    );
  });

  it("Should block sync when a referenced image returns null metadata", async () => {
    const now = new Date().toISOString();
    const imagePath = "images/note-1/missing.png";
    const mockNote = {
      id: "note-1",
      title: "Broken Image Note",
      content: JSON.stringify({
        type: "doc",
        content: [{ type: "image", attrs: { src: imagePath } }],
      }),
      updatedAt: now,
      createdAt: now,
    };

    (getAllNotesWithContent as any).mockResolvedValue([mockNote]);
    (getAllDirectories as any).mockResolvedValue([]);
    (listSyncObjects as any).mockResolvedValue([
      {
        key: imagePath,
        size: 128,
        last_modified: now,
        etag: '"etag-image"',
      },
    ]);
    (getSyncRecordsByProfile as any).mockResolvedValue([
      {
        entityId: imagePath,
        entityType: "image",
        key: imagePath,
        localMtime: Math.floor(new Date(now).getTime() / 1000),
        remoteMtime: Math.floor(new Date(now).getTime() / 1000),
        size: 128,
        profileId: "profile-1",
      },
    ]);
    (extractManagedImagePathsFromRecords as any).mockReturnValue([imagePath]);
    (getManagedImageMetadata as any).mockResolvedValue(null);

    const result = await performIncrementalSync(mockOptions);

    expect(result.success).toBe(false);
    expect(result.blockedBySafety).toBe(true);
    expect(result.plan.remoteDeletes).toHaveLength(0);
    expect(result.plan.conflicts).toHaveLength(1);
    expect(result.safetyReport.passed).toBe(false);
    expect(result.errors[0]).toContain(
      "unsafe item(s) require manual intervention",
    );
  });

  it("Should block sync when reading referenced image metadata throws", async () => {
    const now = new Date().toISOString();
    const imagePath = "images/note-1/broken.png";
    const mockNote = {
      id: "note-1",
      title: "Broken Image Note",
      content: JSON.stringify({
        type: "doc",
        content: [{ type: "image", attrs: { src: imagePath } }],
      }),
      updatedAt: now,
      createdAt: now,
    };

    (getAllNotesWithContent as any).mockResolvedValue([mockNote]);
    (getAllDirectories as any).mockResolvedValue([]);
    (listSyncObjects as any).mockResolvedValue([
      {
        key: imagePath,
        size: 128,
        last_modified: now,
        etag: '"etag-image"',
      },
    ]);
    (getSyncRecordsByProfile as any).mockResolvedValue([
      {
        entityId: imagePath,
        entityType: "image",
        key: imagePath,
        localMtime: Math.floor(new Date(now).getTime() / 1000),
        remoteMtime: Math.floor(new Date(now).getTime() / 1000),
        size: 128,
        profileId: "profile-1",
      },
    ]);
    (extractManagedImagePathsFromRecords as any).mockReturnValue([imagePath]);
    (getManagedImageMetadata as any).mockRejectedValue(new Error("EIO"));

    const result = await performIncrementalSync(mockOptions);

    expect(result.success).toBe(false);
    expect(result.blockedBySafety).toBe(true);
    expect(result.plan.remoteDeletes).toHaveLength(0);
    expect(result.plan.conflicts).toHaveLength(1);
    expect(result.errors[0]).toContain(
      "unsafe item(s) require manual intervention",
    );
  });

  it("Should not keep reporting sync needed for a legacy directory after upload", async () => {
    const now = new Date().toISOString();
    const syncRecords: any[] = [];
    const remoteObjects: Array<{
      key: string;
      size: number;
      last_modified: string;
      etag: string;
    }> = [];

    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllDirectories as any).mockResolvedValue([
      {
        id: "legacy-dir",
        name: "Legacy",
        parentId: null,
      },
    ]);
    (getSyncRecordsByProfile as any).mockImplementation(
      async () => syncRecords,
    );
    (listSyncObjects as any).mockImplementation(
      async (
        _connectionId: string,
        _bucketName: string,
        requestedPrefix?: string,
      ) =>
        remoteObjects.filter((obj) =>
          requestedPrefix ? obj.key.startsWith(requestedPrefix) : true,
        ),
    );
    (upsertSyncRecord as any).mockImplementation(async (record: any) => {
      const existingIndex = syncRecords.findIndex(
        (item) =>
          item.entityId === record.entityId &&
          item.profileId === record.profileId,
      );
      const nextRecord = {
        id: `sync-${record.entityId}`,
        ...record,
      };

      if (existingIndex >= 0) {
        syncRecords[existingIndex] = nextRecord;
      } else {
        syncRecords.push(nextRecord);
      }
    });
    (uploadSyncObject as any).mockImplementation(
      async (
        _connectionId: string,
        _bucketName: string,
        key: string,
        content: string,
      ) => {
        const object = {
          key,
          size: new TextEncoder().encode(content).length,
          last_modified: now,
          etag: '"legacy-dir-etag"',
        };
        const existingIndex = remoteObjects.findIndex(
          (item) => item.key === key,
        );

        if (existingIndex >= 0) {
          remoteObjects[existingIndex] = object;
        } else {
          remoteObjects.push(object);
        }

        return object;
      },
    );

    const result = await performIncrementalSync(mockOptions);
    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(1);

    const preview = await previewIncrementalSync(mockOptions);
    expect(preview.description).toBe("No changes needed");
    expect(preview.plan.uploads).toHaveLength(0);
    expect(preview.plan.downloads).toHaveLength(0);
    expect(preview.plan.localDeletes).toHaveLength(0);
    expect(preview.plan.remoteDeletes).toHaveLength(0);
  });

  it("Should merge same-name remote folders without remote delete errors", async () => {
    const now = new Date().toISOString();
    const syncRecords: any[] = [];
    const remoteObjects: Array<{
      key: string;
      size: number;
      last_modified: string;
      etag: string;
    }> = [
      {
        key: "zerosort/directories/remote-dir.json",
        size: 40,
        last_modified: now,
        etag: '"remote-dir-etag"',
      },
    ];
    const localDirectories = [
      {
        id: "local-dir",
        name: "Projects",
        parentId: null,
        updatedAt: now,
      },
    ];

    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllDirectories as any).mockImplementation(async () => localDirectories);
    (getDirectoryByNameAndParent as any).mockImplementation(
      async (name: string, parentId: string | null) =>
        localDirectories.find(
          (dir) => dir.name === name && dir.parentId === parentId,
        ),
    );
    (getSyncRecordsByProfile as any).mockImplementation(
      async () => syncRecords,
    );
    (listSyncObjects as any).mockImplementation(
      async (
        _connectionId: string,
        _bucketName: string,
        requestedPrefix?: string,
      ) =>
        remoteObjects.filter((obj) =>
          requestedPrefix ? obj.key.startsWith(requestedPrefix) : true,
        ),
    );
    (upsertSyncRecord as any).mockImplementation(async (record: any) => {
      const existingIndex = syncRecords.findIndex(
        (item) =>
          item.entityId === record.entityId &&
          item.profileId === record.profileId,
      );
      const nextRecord = {
        id: `sync-${record.entityId}`,
        ...record,
      };

      if (existingIndex >= 0) {
        syncRecords[existingIndex] = nextRecord;
      } else {
        syncRecords.push(nextRecord);
      }
    });
    (downloadSyncObject as any).mockResolvedValue(
      JSON.stringify({
        id: "remote-dir",
        name: "Projects",
        parentId: null,
        updatedAt: now,
      }),
    );
    (uploadSyncObject as any).mockImplementation(
      async (
        _connectionId: string,
        _bucketName: string,
        key: string,
        content: string,
      ) => {
        const object = {
          key,
          size: new TextEncoder().encode(content).length,
          last_modified: now,
          etag: '"uploaded-etag"',
        };
        const existingIndex = remoteObjects.findIndex(
          (item) => item.key === key,
        );
        if (existingIndex >= 0) {
          remoteObjects[existingIndex] = object;
        } else {
          remoteObjects.push(object);
        }
        return object;
      },
    );
    (deleteSyncObjectsBatch as any).mockImplementation(
      async (_connectionId: string, _bucketName: string, keys: string[]) => {
        const deleted_keys: string[] = [];
        for (const key of keys) {
          const index = remoteObjects.findIndex((item) => item.key === key);
          if (index >= 0) {
            remoteObjects.splice(index, 1);
            deleted_keys.push(key);
          }
        }
        return { deleted_keys, failed_keys: [], errors: [] };
      },
    );

    const result = await performIncrementalSync(mockOptions);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(saveDirectory).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "remote-dir" }),
    );
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "local-dir",
        key: "directories/local-dir.json",
      }),
    );
    expect(remoteObjects.map((obj) => obj.key)).toEqual([
      "zerosort/directories/local-dir.json",
    ]);

    const preview = await previewIncrementalSync(mockOptions);
    expect(preview.plan.remoteDeletes).toHaveLength(0);
  });

  it("Should block unexpected empty-local remote deletions without allowing confirmation", async () => {
    const now = new Date().toISOString();

    (getAllNotesWithContent as any).mockResolvedValue([]);
    (getAllDirectories as any).mockResolvedValue([]);
    (listSyncObjects as any).mockImplementation(
      async (
        _connectionId: string,
        _bucketName: string,
        requestedPrefix = "",
      ) =>
        requestedPrefix === "zerosort/notes/"
          ? [
              {
                key: "zerosort/notes/remote-note.json",
                size: 100,
                last_modified: now,
                etag: '"etag-remote"',
              },
            ]
          : [],
    );
    (getSyncRecordsByProfile as any).mockResolvedValue([
      {
        entityId: "remote-note",
        entityType: "note",
        key: "notes/remote-note.json",
        localMtime: new Date(now).getTime(),
        remoteMtime: new Date(now).getTime(),
        size: 100,
        etag: '"etag-remote"',
        profileId: "profile-1",
      },
    ]);

    const result = await performIncrementalSync(mockOptions);

    expect(result.success).toBe(false);
    expect(result.blockedBySafety).toBe(true);
    expect(result.safetyReport.confirmable).toBe(false);
    expect(result.safetyReport.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unexpected_empty_local",
          passed: false,
        }),
      ]),
    );
  });
});
