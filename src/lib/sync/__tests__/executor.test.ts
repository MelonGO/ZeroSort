/**
 * Tests for sync executor remote delete behavior.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/directories", () => ({
  deleteDirectoryFromDb: vi.fn(),
  getDirectoryById: vi.fn(),
  getDirectoryByNameAndParent: vi.fn(),
  saveDirectory: vi.fn(),
}));

vi.mock("@/lib/db/notes", () => ({
  deleteNoteFromDb: vi.fn(),
  getNoteByIdWithContent: vi.fn(),
  saveNote: vi.fn(),
}));

vi.mock("@/lib/db/tags", () => ({
  deleteTagFromDb: vi.fn(),
  getTagById: vi.fn(),
  saveTag: vi.fn(),
}));

vi.mock("@/lib/db/syncRecords", () => ({
  deleteSyncRecord: vi.fn(),
  deleteSyncRecordsByEntityIds: vi.fn(),
  getSyncRecordsByProfile: vi.fn().mockResolvedValue([]),
  upsertSyncRecord: vi.fn(),
}));

vi.mock("@/lib/images", () => ({
  deleteManagedImageFile: vi.fn(),
  getManagedImageMetadata: vi.fn(),
  readManagedImageFile: vi.fn(),
  writeManagedImageFile: vi.fn(),
}));

vi.mock("../s3", () => ({
  deleteSyncObjectsBatch: vi.fn(),
  downloadSyncBinaryObject: vi.fn(),
  downloadSyncObject: vi.fn(),
  uploadSyncBinaryObject: vi.fn(),
  uploadSyncObject: vi.fn(),
}));

import {
  deleteDirectoryFromDb,
  getDirectoryById,
  getDirectoryByNameAndParent,
  saveDirectory,
} from "@/lib/db/directories";
import {
  deleteNoteFromDb,
  getNoteByIdWithContent,
  saveNote,
} from "@/lib/db/notes";
import {
  deleteSyncRecord,
  deleteSyncRecordsByEntityIds,
  getSyncRecordsByProfile,
  upsertSyncRecord,
} from "@/lib/db/syncRecords";
import {
  deleteManagedImageFile,
  getManagedImageMetadata,
  readManagedImageFile,
} from "@/lib/images";
import type { SyncPlan } from "@/types/sync";
import {
  executeSyncPlan,
  getEntityId,
  getEntityType,
  validateExecutorOptions,
  validateSyncExecutionSafety,
} from "../executor";
import {
  deleteSyncObjectsBatch,
  downloadSyncObject,
  uploadSyncBinaryObject,
  uploadSyncObject,
} from "../s3";

describe("Sync Executor - Remote Delete Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should only clear sync records for keys confirmed deleted remotely", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [
        {
          key: "notes/note-1.json",
          prevSync: {
            id: "note-1",
            entityType: "note",
            key: "notes/note-1.json",
            mtime: 1000,
            size: 10,
          },
        },
        {
          key: "notes/note-2.json",
          prevSync: {
            id: "note-2",
            entityType: "note",
            key: "notes/note-2.json",
            mtime: 1000,
            size: 10,
          },
        },
      ],
      conflicts: [],
      unchanged: [],
    };

    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: ["zerosort/notes/note-1.json"],
      failed_keys: ["zerosort/notes/note-2.json"],
      errors: ["zerosort/notes/note-2.json: AccessDenied"],
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      prefix: "zerosort/",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(false);
    expect(result.deleted).toBe(1);
    expect(result.errors).toContain(
      "Failed to batch delete remote objects: Error: Remote delete incomplete for 1 objects: zerosort/notes/note-2.json: AccessDenied",
    );
    expect(deleteSyncRecordsByEntityIds).toHaveBeenCalledWith(
      ["note-1"],
      "profile-1",
    );
  });

  it("Should clear all matching sync records when remote batch delete fully succeeds", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [
        {
          key: "notes/note-1.json",
          prevSync: {
            id: "note-1",
            entityType: "note",
            key: "notes/note-1.json",
            mtime: 1000,
            size: 10,
          },
        },
      ],
      conflicts: [],
      unchanged: [],
    };

    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: ["notes/note-1.json"],
      failed_keys: [],
      errors: [],
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
    expect(deleteSyncRecordsByEntityIds).toHaveBeenCalledWith(
      ["note-1"],
      "profile-1",
    );
  });

  it("Should report monotonic upload progress when uploads finish out of order", async () => {
    const now = new Date().toISOString();
    const progressUpdates: number[] = [];

    const plan: SyncPlan = {
      uploads: [
        {
          key: "notes/note-1.json",
          local: {
            id: "note-1",
            entityType: "note",
            key: "notes/note-1.json",
            mtime: 1000,
            size: 10,
          },
        },
        {
          key: "notes/note-2.json",
          local: {
            id: "note-2",
            entityType: "note",
            key: "notes/note-2.json",
            mtime: 1000,
            size: 10,
          },
        },
        {
          key: "notes/note-3.json",
          local: {
            id: "note-3",
            entityType: "note",
            key: "notes/note-3.json",
            mtime: 1000,
            size: 10,
          },
        },
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const noteData: Record<string, any> = {
      "note-1": {
        id: "note-1",
        title: "Note 1",
        summary: "",
        content: "One",
        directoryId: null,
        createdAt: now,
        updatedAt: now,
      },
      "note-2": {
        id: "note-2",
        title: "Note 2",
        summary: "",
        content: "Two",
        directoryId: null,
        createdAt: now,
        updatedAt: now,
      },
      "note-3": {
        id: "note-3",
        title: "Note 3",
        summary: "",
        content: "Three",
        directoryId: null,
        createdAt: now,
        updatedAt: now,
      },
    };

    (getNoteByIdWithContent as any).mockImplementation(
      async (id: string) => noteData[id] ?? null,
    );

    (uploadSyncObject as any).mockImplementation(
      async (_connectionId: string, _bucketName: string, key: string) => {
        const delayByKey: Record<string, number> = {
          "notes/note-1.json": 30,
          "notes/note-2.json": 5,
          "notes/note-3.json": 15,
        };

        await new Promise((resolve) => setTimeout(resolve, delayByKey[key]));

        return {
          key,
          etag: `\"${key}-etag\"`,
          last_modified: now,
        };
      },
    );

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
      concurrency: 3,
      onProgress: (progress) => {
        if (progress.phase === "uploading" && progress.total === 3) {
          progressUpdates.push(progress.current);
        }
      },
    });

    expect(result.success).toBe(true);
    expect(progressUpdates).toEqual([0, 1, 2, 3]);
  });

  it("Should reject unsafe remote image deletes before execution", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [
        {
          key: "images/note-1/image.png",
          localImageReferenced: true,
          prevSync: {
            id: "images/note-1/image.png",
            entityType: "image",
            key: "images/note-1/image.png",
            mtime: 1000,
            size: 10,
          },
          decision: "local_is_deleted_thus_also_delete_remote",
        },
      ],
      conflicts: [],
      unchanged: [],
    };

    expect(validateSyncExecutionSafety(plan)).toContain(
      "Refusing to delete remote image images/note-1/image.png because it is still referenced locally or its local reference state is unknown.",
    );

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Refusing to delete remote image");
    expect(deleteSyncObjectsBatch).not.toHaveBeenCalled();
  });

  it("Should preserve a legacy directory mtime when uploading", async () => {
    const now = new Date().toISOString();

    const plan: SyncPlan = {
      uploads: [
        {
          key: "directories/legacy-dir.json",
          local: {
            id: "legacy-dir",
            entityType: "directory",
            key: "directories/legacy-dir.json",
            mtime: 0,
            size: 64,
          },
        },
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (getDirectoryById as any).mockResolvedValue({
      id: "legacy-dir",
      name: "Legacy",
      parentId: null,
    });
    (uploadSyncObject as any).mockResolvedValue({
      key: "directories/legacy-dir.json",
      etag: '"dir-etag"',
      last_modified: now,
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "legacy-dir",
        entityType: "directory",
        key: "directories/legacy-dir.json",
        localMtime: 0,
      }),
    );
  });
});

describe("Sync Executor - Note Upload Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should upload a note and create a sync record with correct fields", async () => {
    const now = "2024-06-15T12:00:00.000Z";
    const plan: SyncPlan = {
      uploads: [
        {
          key: "notes/note-1.json",
          local: {
            id: "note-1",
            entityType: "note",
            key: "notes/note-1.json",
            mtime: 1718452800000,
            size: 100,
          },
        },
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (getNoteByIdWithContent as any).mockResolvedValue({
      id: "note-1",
      title: "My Note",
      summary: "A test note",
      content: "<p>Hello</p>",
      directoryId: null,
      tagIds: [],
      createdAt: now,
      updatedAt: now,
    });

    (uploadSyncObject as any).mockResolvedValue({
      key: "notes/note-1.json",
      etag: '"note-1-etag"',
      last_modified: now,
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(1);
    expect(uploadSyncObject).toHaveBeenCalledTimes(1);
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "note-1",
        entityType: "note",
        key: "notes/note-1.json",
        localMtime: 1718452800000,
        etag: '"note-1-etag"',
        profileId: "profile-1",
      }),
    );
  });

  it("Should reject an oversized image upload before reading local bytes", async () => {
    const plan: SyncPlan = {
      uploads: [
        {
          key: "images/note-1/large.png",
          local: {
            id: "images/note-1/large.png",
            entityType: "image",
            key: "images/note-1/large.png",
            mtime: 1718452800000,
            size: 0,
          },
        },
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (getManagedImageMetadata as any).mockResolvedValue({
      relativePath: "images/note-1/large.png",
      absolutePath: "/tmp/large.png",
      sizeBytes: 25 * 1024 * 1024,
      modifiedAtMs: 1718452800000,
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(false);
    expect(result.uploaded).toBe(0);
    expect(result.errors).toContain(
      "Failed to upload images/note-1/large.png: Error: Managed image is too large to sync: 26214445 bytes exceeds the 26214400 byte upload limit",
    );
    expect(readManagedImageFile).not.toHaveBeenCalled();
    expect(uploadSyncBinaryObject).not.toHaveBeenCalled();
    expect(upsertSyncRecord).not.toHaveBeenCalled();
  });
});

describe("Sync Executor - Note Download Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should download a note, save to DB, and create sync record", async () => {
    const now = "2024-06-15T12:00:00.000Z";
    const plan: SyncPlan = {
      uploads: [],
      downloads: [
        {
          key: "notes/note-remote.json",
          remote: {
            id: "note-remote",
            entityType: "note",
            key: "notes/note-remote.json",
            mtime: 1718452800000,
            size: 200,
            etag: '"remote-etag"',
          },
        },
      ],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    // downloadSyncObject returns serialized JSON (encrypted content)
    const notePayload = JSON.stringify({
      encrypted: "mock-encrypted-content",
    });
    (downloadSyncObject as any).mockResolvedValue(notePayload);

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(1);
    expect(downloadSyncObject).toHaveBeenCalledTimes(1);
    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "note-remote",
        entityType: "note",
        key: "notes/note-remote.json",
        remoteMtime: 1718452800000,
        profileId: "profile-1",
      }),
    );
  });
});

describe("Sync Executor - Directory Name Collision Merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getDirectoryByNameAndParent as any).mockResolvedValue(undefined);
    (getSyncRecordsByProfile as any).mockResolvedValue([]);
    (getDirectoryById as any).mockResolvedValue(undefined);
    (uploadSyncObject as any).mockResolvedValue({
      etag: '"canonical-etag"',
      last_modified: "2024-06-15T12:00:00.000Z",
    });
    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: [],
      failed_keys: [],
      errors: [],
    });
  });

  it("Should merge a remote root directory onto an existing local same-name folder", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [
        {
          key: "directories/remote-dir.json",
          remote: {
            id: "remote-dir",
            entityType: "directory",
            key: "directories/remote-dir.json",
            mtime: 1718452800000,
            size: 40,
            etag: '"dir-etag"',
          },
        },
      ],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (downloadSyncObject as any).mockResolvedValue(
      JSON.stringify({
        id: "remote-dir",
        name: "Projects",
        parentId: null,
        updatedAt: "2024-06-15T12:00:00.000Z",
      }),
    );
    (getDirectoryByNameAndParent as any).mockResolvedValue({
      id: "local-dir",
      name: "Projects",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    (getDirectoryById as any).mockResolvedValue({
      id: "local-dir",
      name: "Projects",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: ["directories/remote-dir.json"],
      failed_keys: [],
      errors: [],
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(1);
    expect(saveDirectory).not.toHaveBeenCalled();
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "local-dir",
        entityType: "directory",
        key: "directories/local-dir.json",
        profileId: "profile-1",
      }),
    );
    expect(uploadSyncObject).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      "directories/local-dir.json",
      expect.any(String),
    );
    expect(deleteSyncObjectsBatch).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      ["directories/remote-dir.json"],
    );
  });

  it("Should resolve a child directory against a remapped local parent", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [
        {
          key: "directories/remote-child.json",
          remote: {
            id: "remote-child",
            entityType: "directory",
            key: "directories/remote-child.json",
            mtime: 1718452800000,
            size: 40,
            etag: '"child-etag"',
          },
        },
        {
          key: "directories/remote-parent.json",
          remote: {
            id: "remote-parent",
            entityType: "directory",
            key: "directories/remote-parent.json",
            mtime: 1718452800000,
            size: 40,
            etag: '"parent-etag"',
          },
        },
      ],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (downloadSyncObject as any).mockImplementation(
      async (_c: string, _b: string, key: string) => {
        if (key.includes("remote-parent")) {
          return JSON.stringify({
            id: "remote-parent",
            name: "Parent",
            parentId: null,
            updatedAt: "2024-06-15T12:00:00.000Z",
          });
        }
        return JSON.stringify({
          id: "remote-child",
          name: "Child",
          parentId: "remote-parent",
          updatedAt: "2024-06-15T12:00:00.000Z",
        });
      },
    );

    (getDirectoryByNameAndParent as any).mockImplementation(
      async (name: string, parentId: string | null) => {
        if (name === "Parent" && parentId === null) {
          return {
            id: "local-parent",
            name: "Parent",
            parentId: null,
            updatedAt: "2024-01-01T00:00:00.000Z",
          };
        }
        if (name === "Child" && parentId === "local-parent") {
          return {
            id: "local-child",
            name: "Child",
            parentId: "local-parent",
            updatedAt: "2024-01-01T00:00:00.000Z",
          };
        }
        return undefined;
      },
    );
    (getDirectoryById as any).mockImplementation(async (id: string) => {
      if (id === "local-parent") {
        return {
          id: "local-parent",
          name: "Parent",
          parentId: null,
          updatedAt: "2024-01-01T00:00:00.000Z",
        };
      }
      if (id === "local-child") {
        return {
          id: "local-child",
          name: "Child",
          parentId: "local-parent",
          updatedAt: "2024-01-01T00:00:00.000Z",
        };
      }
      return undefined;
    });
    (deleteSyncObjectsBatch as any).mockImplementation(
      async (_c: string, _b: string, keys: string[]) => ({
        deleted_keys: keys,
        failed_keys: [],
        errors: [],
      }),
    );

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.downloaded).toBe(2);
    expect(saveDirectory).not.toHaveBeenCalled();
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "local-parent",
        key: "directories/local-parent.json",
      }),
    );
    expect(upsertSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "local-child",
        key: "directories/local-child.json",
      }),
    );
  });

  it("Should save a downloaded note under the remapped local directory ID", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [
        {
          key: "directories/remote-dir.json",
          remote: {
            id: "remote-dir",
            entityType: "directory",
            key: "directories/remote-dir.json",
            mtime: 1718452800000,
            size: 40,
            etag: '"dir-etag"',
          },
        },
        {
          key: "notes/remote-note.json",
          remote: {
            id: "remote-note",
            entityType: "note",
            key: "notes/remote-note.json",
            mtime: 1718452800000,
            size: 100,
            etag: '"note-etag"',
          },
        },
      ],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (downloadSyncObject as any).mockImplementation(
      async (_c: string, _b: string, key: string) => {
        if (key.includes("directories/")) {
          return JSON.stringify({
            id: "remote-dir",
            name: "Projects",
            parentId: null,
            updatedAt: "2024-06-15T12:00:00.000Z",
          });
        }
        return JSON.stringify({
          id: "remote-note",
          title: "Hello",
          summary: "",
          content: "{}",
          directoryId: "remote-dir",
          tagIds: [],
          createdAt: "2024-06-15T12:00:00.000Z",
          updatedAt: "2024-06-15T12:00:00.000Z",
        });
      },
    );
    (getDirectoryByNameAndParent as any).mockResolvedValue({
      id: "local-dir",
      name: "Projects",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    (getDirectoryById as any).mockResolvedValue({
      id: "local-dir",
      name: "Projects",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: ["directories/remote-dir.json"],
      failed_keys: [],
      errors: [],
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "remote-note",
        directoryId: "local-dir",
      }),
    );
  });

  it("Should remap a note directoryId from a persisted sync-record alias without a directory download", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [
        {
          key: "notes/remote-note.json",
          remote: {
            id: "remote-note",
            entityType: "note",
            key: "notes/remote-note.json",
            mtime: 1718452800000,
            size: 100,
            etag: '"note-etag"',
          },
        },
      ],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (getSyncRecordsByProfile as any).mockResolvedValue([
      {
        id: "sync-1",
        entityId: "local-dir",
        entityType: "directory",
        key: "directories/remote-dir.json",
        localMtime: 1000,
        remoteMtime: 1000,
        size: 40,
        syncedAt: "2024-01-01T00:00:00.000Z",
        profileId: "profile-1",
      },
    ]);
    (downloadSyncObject as any).mockResolvedValue(
      JSON.stringify({
        id: "remote-note",
        title: "Hello",
        summary: "",
        content: "{}",
        directoryId: "remote-dir",
        tagIds: [],
        createdAt: "2024-06-15T12:00:00.000Z",
        updatedAt: "2024-06-15T12:00:00.000Z",
      }),
    );

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "remote-note",
        directoryId: "local-dir",
      }),
    );
    expect(getDirectoryByNameAndParent).not.toHaveBeenCalled();
  });

  it("Should skip uploading a local colliding directory and delete the duplicate remote object", async () => {
    const plan: SyncPlan = {
      uploads: [
        {
          key: "directories/local-dir.json",
          local: {
            id: "local-dir",
            entityType: "directory",
            key: "directories/local-dir.json",
            mtime: 1718452800000,
            size: 40,
          },
        },
      ],
      downloads: [
        {
          key: "directories/remote-dir.json",
          remote: {
            id: "remote-dir",
            entityType: "directory",
            key: "directories/remote-dir.json",
            mtime: 1718452800000,
            size: 40,
            etag: '"dir-etag"',
          },
        },
      ],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    (downloadSyncObject as any).mockResolvedValue(
      JSON.stringify({
        id: "remote-dir",
        name: "Projects",
        parentId: null,
        updatedAt: "2024-06-15T12:00:00.000Z",
      }),
    );
    (getDirectoryByNameAndParent as any).mockResolvedValue({
      id: "local-dir",
      name: "Projects",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    (getDirectoryById as any).mockResolvedValue({
      id: "local-dir",
      name: "Projects",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    (deleteSyncObjectsBatch as any).mockResolvedValue({
      deleted_keys: ["directories/remote-dir.json"],
      failed_keys: [],
      errors: [],
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(0);
    expect(result.downloaded).toBe(1);

    // Only the canonical-key publish from the merge, not the skipped local upload path.
    expect(uploadSyncObject).toHaveBeenCalledTimes(1);
    expect(uploadSyncObject).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      "directories/local-dir.json",
      expect.any(String),
    );

    const directorySyncRecords = (upsertSyncRecord as any).mock.calls.filter(
      (call: any[]) => call[0]?.entityType === "directory",
    );
    expect(directorySyncRecords).toHaveLength(1);
    expect(directorySyncRecords[0][0]).toEqual(
      expect.objectContaining({
        entityId: "local-dir",
        key: "directories/local-dir.json",
      }),
    );

    expect(deleteSyncObjectsBatch).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      ["directories/remote-dir.json"],
    );
  });
});

describe("Sync Executor - Local Delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should delete a note from DB and remove sync record", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [
        {
          key: "notes/note-del.json",
          local: {
            id: "note-del",
            entityType: "note",
            key: "notes/note-del.json",
            mtime: 1000,
            size: 50,
          },
          decision: "remote_is_deleted_thus_also_delete_local",
        },
      ],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.deleted).toBe(1);
    expect(deleteNoteFromDb).toHaveBeenCalledWith("note-del");
    expect(deleteSyncRecord).toHaveBeenCalledWith("note-del", "profile-1");
  });

  it("Should delete a directory from DB and remove sync record", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [
        {
          key: "directories/dir-del.json",
          local: {
            id: "dir-del",
            entityType: "directory",
            key: "directories/dir-del.json",
            mtime: 1000,
            size: 30,
          },
          decision: "remote_is_deleted_thus_also_delete_local",
        },
      ],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(deleteDirectoryFromDb).toHaveBeenCalledWith("dir-del");
    expect(deleteSyncRecord).toHaveBeenCalledWith("dir-del", "profile-1");
  });

  it("Should delete an image file and remove sync record", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [
        {
          key: "images/note-1/photo.png",
          local: {
            id: "images/note-1/photo.png",
            entityType: "image",
            key: "images/note-1/photo.png",
            mtime: 1000,
            size: 5000,
          },
          decision: "remote_is_deleted_thus_also_delete_local",
        },
      ],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(deleteManagedImageFile).toHaveBeenCalledWith(
      "images/note-1/photo.png",
    );
    expect(deleteSyncRecord).toHaveBeenCalledWith(
      "images/note-1/photo.png",
      "profile-1",
    );
  });
});

describe("Sync Executor - Empty Plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should return success with zero counts for empty plan", async () => {
    const plan: SyncPlan = {
      uploads: [],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(0);
    expect(result.downloaded).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe("Sync Executor - Upload Failure Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should continue uploading other notes when one fails", async () => {
    const now = new Date().toISOString();
    const plan: SyncPlan = {
      uploads: [
        {
          key: "notes/fail.json",
          local: {
            id: "fail",
            entityType: "note",
            key: "notes/fail.json",
            mtime: 1000,
            size: 10,
          },
        },
        {
          key: "notes/succeed.json",
          local: {
            id: "succeed",
            entityType: "note",
            key: "notes/succeed.json",
            mtime: 1000,
            size: 10,
          },
        },
      ],
      downloads: [],
      localDeletes: [],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const noteData: Record<string, any> = {
      fail: {
        id: "fail",
        title: "Fail",
        summary: "",
        content: "X",
        directoryId: null,
        createdAt: now,
        updatedAt: now,
      },
      succeed: {
        id: "succeed",
        title: "Succeed",
        summary: "",
        content: "Y",
        directoryId: null,
        createdAt: now,
        updatedAt: now,
      },
    };

    (getNoteByIdWithContent as any).mockImplementation(
      async (id: string) => noteData[id] ?? null,
    );

    let callCount = 0;
    (uploadSyncObject as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Network error");
      }
      return { key: "notes/succeed.json", etag: '"ok"', last_modified: now };
    });

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
    });

    expect(result.success).toBe(false);
    expect(result.uploaded).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Failed to upload");
  });
});

describe("Sync Executor - Dry Run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should return plan counts without executing operations", async () => {
    const plan: SyncPlan = {
      uploads: [
        {
          key: "notes/note-1.json",
          local: {
            id: "note-1",
            entityType: "note",
            key: "notes/note-1.json",
            mtime: 1000,
            size: 100,
          },
        },
      ],
      downloads: [
        {
          key: "notes/note-2.json",
          remote: {
            id: "note-2",
            entityType: "note",
            key: "notes/note-2.json",
            mtime: 1000,
            size: 100,
          },
        },
      ],
      localDeletes: [
        {
          key: "notes/note-3.json",
          local: {
            id: "note-3",
            entityType: "note",
            key: "notes/note-3.json",
            mtime: 1000,
            size: 100,
          },
        },
      ],
      remoteDeletes: [],
      conflicts: [],
      unchanged: [],
    };

    const result = await executeSyncPlan(plan, {
      connectionId: "conn-1",
      bucketName: "bucket-1",
      profileId: "profile-1",
      encryptionPassword: "secret",
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.uploaded).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(result.deleted).toBe(1);
    // No actual operations should have been called
    expect(uploadSyncObject).not.toHaveBeenCalled();
    expect(downloadSyncObject).not.toHaveBeenCalled();
    expect(deleteNoteFromDb).not.toHaveBeenCalled();
  });
});

describe("Sync Executor - Utility Functions", () => {
  it("Should get entity ID from local, remote, or prevSync", () => {
    expect(
      getEntityId({
        key: "notes/n.json",
        local: {
          id: "from-local",
          entityType: "note",
          key: "notes/n.json",
          mtime: 0,
          size: 0,
        },
      }),
    ).toBe("from-local");

    expect(
      getEntityId({
        key: "notes/n.json",
        remote: {
          id: "from-remote",
          entityType: "note",
          key: "notes/n.json",
          mtime: 0,
          size: 0,
        },
      }),
    ).toBe("from-remote");

    expect(
      getEntityId({
        key: "notes/n.json",
        prevSync: {
          id: "from-prev",
          entityType: "note",
          key: "notes/n.json",
          mtime: 0,
          size: 0,
        },
      }),
    ).toBe("from-prev");

    expect(getEntityId({ key: "notes/n.json" })).toBeUndefined();
  });

  it("Should get entity type from local, remote, or prevSync", () => {
    expect(
      getEntityType({
        key: "d.json",
        local: {
          id: "d",
          entityType: "directory",
          key: "d.json",
          mtime: 0,
          size: 0,
        },
      }),
    ).toBe("directory");

    expect(getEntityType({ key: "x.json" })).toBeUndefined();
  });

  it("Should validate executor options", () => {
    expect(
      validateExecutorOptions({
        connectionId: "",
        bucketName: "",
        profileId: "",
        encryptionPassword: "pass",
      }),
    ).toEqual(
      expect.arrayContaining([
        "Connection ID is required",
        "Bucket name is required",
        "Profile ID is required",
      ]),
    );

    expect(
      validateExecutorOptions({
        connectionId: "c",
        bucketName: "b",
        profileId: "p",
        encryptionPassword: "pass",
        concurrency: 100,
      }),
    ).toContain("Concurrency must be between 1 and 50");

    expect(
      validateExecutorOptions({
        connectionId: "c",
        bucketName: "b",
        profileId: "p",
        encryptionPassword: "pass",
      }),
    ).toEqual([]);
  });
});
