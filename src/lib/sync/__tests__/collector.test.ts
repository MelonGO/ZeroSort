/**
 * Tests for the sync state collector - entity conversion functions and state collection.
 *
 * Mocks external deps (DB, S3, images) following the executor.test.ts pattern.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/syncRecords", () => ({
  getSyncRecordsByProfile: vi.fn(),
}));

vi.mock("@/lib/images", () => ({
  extractManagedImagePathsFromRecords: vi.fn(),
  getManagedImageMetadata: vi.fn(),
}));

vi.mock("../s3", () => ({
  listSyncObjects: vi.fn(),
}));

import { getSyncRecordsByProfile } from "@/lib/db/syncRecords";
import {
  extractManagedImagePathsFromRecords,
  getManagedImageMetadata,
} from "@/lib/images";
import type { Directory, Note, Tag } from "@/types";
import type { SyncRecord } from "@/types/sync";
import {
  healDirectorySyncAliases,
  collectLocalState,
  collectPrevSyncState,
  collectRemoteState,
  directoryToSyncEntity,
  imageToSyncEntity,
  noteToSyncEntity,
  s3ObjectToSyncEntity,
  syncRecordToSyncEntity,
  tagToSyncEntity,
} from "../collector";
import type { SyncObjectInfo } from "../s3";
import { listSyncObjects } from "../s3";

describe("Collector - noteToSyncEntity", () => {
  it("Should convert a note with updatedAt to a SyncEntity", () => {
    const note: Note = {
      id: "note-1",
      title: "Test",
      summary: "",
      content: "Hello",
      directoryId: null,
      tagIds: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-15T12:00:00.000Z",
    };

    const entity = noteToSyncEntity(note);

    expect(entity.id).toBe("note-1");
    expect(entity.entityType).toBe("note");
    expect(entity.key).toBe("notes/note-1.json");
    expect(entity.mtime).toBeGreaterThan(0);
    expect(entity.size).toBeGreaterThan(0);
  });

  it("Should fall back to createdAt when updatedAt is missing", () => {
    const note: Note = {
      id: "note-2",
      title: "Test",
      summary: "",
      content: "",
      directoryId: null,
      tagIds: [],
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const entity = noteToSyncEntity(note);

    expect(entity.mtime).toBe(
      Math.floor(new Date("2024-01-01T00:00:00.000Z").getTime() / 1000) * 1000,
    );
  });
});

describe("Collector - directoryToSyncEntity", () => {
  it("Should convert a directory to a SyncEntity", () => {
    const dir: Directory = {
      id: "dir-1",
      name: "My Folder",
      parentId: null,
      updatedAt: "2024-03-15T10:00:00.000Z",
    };

    const entity = directoryToSyncEntity(dir);

    expect(entity.id).toBe("dir-1");
    expect(entity.entityType).toBe("directory");
    expect(entity.key).toBe("directories/dir-1.json");
    expect(entity.mtime).toBeGreaterThan(0);
    expect(entity.size).toBeGreaterThan(0);
  });

  it("Should handle legacy directory with no updatedAt (mtime=0)", () => {
    const dir: Directory = {
      id: "legacy-dir",
      name: "Old Folder",
      parentId: null,
    };

    const entity = directoryToSyncEntity(dir);

    expect(entity.mtime).toBe(0);
  });
});

describe("Collector - tagToSyncEntity", () => {
  it("Should convert a tag to a SyncEntity", () => {
    const tag: Tag = {
      id: "tag-1",
      name: "important",
      color: "#ff0000",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    };

    const entity = tagToSyncEntity(tag);

    expect(entity.id).toBe("tag-1");
    expect(entity.entityType).toBe("tag");
    expect(entity.key).toBe("tags/tag-1.json");
    expect(entity.mtime).toBeGreaterThan(0);
  });

  it("Should fall back to createdAt when updatedAt is missing", () => {
    const tag: Tag = {
      id: "tag-2",
      name: "work",
      color: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };

    const entity = tagToSyncEntity(tag);

    expect(entity.mtime).toBe(
      Math.floor(new Date("2024-01-01T00:00:00.000Z").getTime() / 1000) * 1000,
    );
  });
});

describe("Collector - imageToSyncEntity", () => {
  it("Should convert image metadata to a SyncEntity with encrypted size", () => {
    const entity = imageToSyncEntity("note-1/image.png", 1000, 1704067200000);

    expect(entity.entityType).toBe("image");
    // Image keys are normalized paths without an "images/" prefix
    expect(entity.key).toBe("note-1/image.png");
    // Size should include encryption overhead (45 bytes)
    expect(entity.size).toBe(1045);
    expect(entity.mtime).toBe(1704067200000);
  });

  it("Should use the key as the entity id", () => {
    const entity = imageToSyncEntity("abc/photo.jpg", 500, 1704067200000);

    expect(entity.id).toBe(entity.key);
  });
});

describe("Collector - s3ObjectToSyncEntity", () => {
  it("Should convert an S3 object to a SyncEntity", () => {
    const obj: SyncObjectInfo = {
      key: "notes/note-1.json",
      size: 256,
      last_modified: "2024-06-15T12:00:00.000Z",
    };

    const entity = s3ObjectToSyncEntity(obj);

    expect(entity).not.toBeNull();
    expect(entity!.id).toBe("note-1");
    expect(entity!.entityType).toBe("note");
    expect(entity!.key).toBe("notes/note-1.json");
    expect(entity!.size).toBe(256);
  });

  it("Should strip prefix from S3 key", () => {
    const obj: SyncObjectInfo = {
      key: "zerosort/notes/note-2.json",
      size: 128,
      last_modified: "2024-01-01T00:00:00.000Z",
    };

    const entity = s3ObjectToSyncEntity(obj, "zerosort/");

    expect(entity).not.toBeNull();
    expect(entity!.id).toBe("note-2");
    expect(entity!.key).toBe("notes/note-2.json");
  });

  it("Should return null for unparseable S3 keys", () => {
    const obj: SyncObjectInfo = {
      key: "unknown/something.txt",
      size: 64,
      last_modified: "2024-01-01T00:00:00.000Z",
    };

    const entity = s3ObjectToSyncEntity(obj);

    expect(entity).toBeNull();
  });

  it("Should parse directory S3 objects", () => {
    const obj: SyncObjectInfo = {
      key: "directories/dir-1.json",
      size: 64,
      last_modified: "2024-01-01T00:00:00.000Z",
    };

    const entity = s3ObjectToSyncEntity(obj);

    expect(entity).not.toBeNull();
    expect(entity!.entityType).toBe("directory");
    expect(entity!.id).toBe("dir-1");
  });

  it("Should parse tag S3 objects", () => {
    const obj: SyncObjectInfo = {
      key: "tags/tag-1.json",
      size: 48,
      last_modified: "2024-01-01T00:00:00.000Z",
    };

    const entity = s3ObjectToSyncEntity(obj);

    expect(entity).not.toBeNull();
    expect(entity!.entityType).toBe("tag");
    expect(entity!.id).toBe("tag-1");
  });
});

describe("Collector - syncRecordToSyncEntity", () => {
  it("Should convert a sync record with dual mtime fields", () => {
    const record: SyncRecord = {
      id: "rec-1",
      entityId: "note-1",
      entityType: "note",
      key: "notes/note-1.json",
      localMtime: 1704067200000,
      remoteMtime: 1704067260000,
      size: 200,
      etag: '"abc123"',
      contentHash: "hash-123",
      syncedAt: "2024-01-01T00:01:00.000Z",
      profileId: "profile-1",
    };

    const entity = syncRecordToSyncEntity(record);

    expect(entity.id).toBe("note-1");
    expect(entity.entityType).toBe("note");
    expect(entity.key).toBe("notes/note-1.json");
    // Primary mtime is remoteMtime
    expect(entity.mtime).toBe(1704067260000);
    expect(entity.localMtime).toBe(1704067200000);
    expect(entity.remoteMtime).toBe(1704067260000);
    expect(entity.etag).toBe('"abc123"');
    expect(entity.contentHash).toBe("hash-123");
    expect(entity.size).toBe(200);
  });

  it("Should handle record without optional fields", () => {
    const record: SyncRecord = {
      id: "rec-2",
      entityId: "dir-1",
      entityType: "directory",
      key: "directories/dir-1.json",
      localMtime: 0,
      remoteMtime: 1704067200000,
      size: 64,
      syncedAt: "2024-01-01T00:00:00.000Z",
      profileId: "profile-1",
    };

    const entity = syncRecordToSyncEntity(record);

    expect(entity.localMtime).toBe(0);
    expect(entity.etag).toBeUndefined();
    expect(entity.contentHash).toBeUndefined();
  });
});

describe("Collector - collectLocalState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should collect notes, directories, and tags into entity map", async () => {
    (extractManagedImagePathsFromRecords as any).mockReturnValue([]);

    const notes: Note[] = [
      {
        id: "note-1",
        title: "Note 1",
        summary: "",
        content: "Hello",
        directoryId: null,
        tagIds: [],
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-06-01T00:00:00.000Z",
      },
    ];
    const directories: Directory[] = [
      { id: "dir-1", name: "Folder", parentId: null },
    ];
    const tags: Tag[] = [
      {
        id: "tag-1",
        name: "work",
        color: null,
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const result = await collectLocalState(notes, directories, tags);

    expect(result.entities.size).toBe(3);
    expect(result.entities.has("notes/note-1.json")).toBe(true);
    expect(result.entities.has("directories/dir-1.json")).toBe(true);
    expect(result.entities.has("tags/tag-1.json")).toBe(true);
  });

  it("Should collect managed images with valid metadata", async () => {
    (extractManagedImagePathsFromRecords as any).mockReturnValue([
      "note-1/image.png",
    ]);
    (getManagedImageMetadata as any).mockResolvedValue({
      sizeBytes: 5000,
      modifiedAtMs: 1704067200000,
    });

    const notes: Note[] = [
      {
        id: "note-1",
        title: "Note 1",
        summary: "",
        content: '<img src="note-1/image.png">',
        directoryId: null,
        tagIds: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const result = await collectLocalState(notes, []);

    // Should have note + image
    expect(result.entities.size).toBe(2);
    expect(result.unsafeLocalImages.size).toBe(0);
  });

  it("Should handle image metadata returning null gracefully", async () => {
    (extractManagedImagePathsFromRecords as any).mockReturnValue([
      "note-1/broken.png",
    ]);
    (getManagedImageMetadata as any).mockResolvedValue(null);

    const notes: Note[] = [
      {
        id: "note-1",
        title: "Note 1",
        summary: "",
        content: '<img src="note-1/broken.png">',
        directoryId: null,
        tagIds: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const result = await collectLocalState(notes, []);

    // Note only (broken image excluded from entities)
    expect(result.entities.size).toBe(1);
    expect(result.unsafeLocalImages.size).toBe(1);
    // Image key should still be in references
    expect(result.localImageReferences.size).toBe(1);
  });

  it("Should handle image metadata throwing an error gracefully", async () => {
    (extractManagedImagePathsFromRecords as any).mockReturnValue([
      "note-1/error.png",
    ]);
    (getManagedImageMetadata as any).mockRejectedValue(
      new Error("File not found"),
    );

    const notes: Note[] = [
      {
        id: "note-1",
        title: "Note 1",
        summary: "",
        content: "",
        directoryId: null,
        tagIds: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const result = await collectLocalState(notes, []);

    expect(result.entities.size).toBe(1); // Note only
    expect(result.unsafeLocalImages.size).toBe(1);
  });

  it("Should handle empty inputs", async () => {
    (extractManagedImagePathsFromRecords as any).mockReturnValue([]);

    const result = await collectLocalState([], []);

    expect(result.entities.size).toBe(0);
    expect(result.localImageReferences.size).toBe(0);
    expect(result.unsafeLocalImages.size).toBe(0);
  });

  it("Should default tags to empty array", async () => {
    (extractManagedImagePathsFromRecords as any).mockReturnValue([]);

    const notes: Note[] = [
      {
        id: "note-1",
        title: "Test",
        summary: "",
        content: "",
        directoryId: null,
        tagIds: [],
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    // Omit tags parameter
    const result = await collectLocalState(notes, []);

    expect(result.entities.size).toBe(1);
  });
});

describe("Collector - collectRemoteState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should list all 4 prefixes and aggregate entities", async () => {
    (listSyncObjects as any).mockImplementation(
      async (
        _connId: string,
        _bucket: string,
        prefix: string,
      ): Promise<SyncObjectInfo[]> => {
        if (prefix === "notes/") {
          return [
            {
              key: "notes/note-1.json",
              size: 200,
              last_modified: "2024-01-01T00:00:00.000Z",
            },
          ];
        }
        if (prefix === "directories/") {
          return [
            {
              key: "directories/dir-1.json",
              size: 64,
              last_modified: "2024-01-01T00:00:00.000Z",
            },
          ];
        }
        return [];
      },
    );

    const entities = await collectRemoteState("conn-1", "bucket-1");

    expect(entities.size).toBe(2);
    expect(entities.has("notes/note-1.json")).toBe(true);
    expect(entities.has("directories/dir-1.json")).toBe(true);
    // Should call listSyncObjects for all 4 prefixes
    expect(listSyncObjects).toHaveBeenCalledTimes(4);
  });

  it("Should prepend custom prefix to S3 listing calls", async () => {
    (listSyncObjects as any).mockResolvedValue([]);

    await collectRemoteState("conn-1", "bucket-1", "zerosort/");

    expect(listSyncObjects).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      "zerosort/notes/",
    );
    expect(listSyncObjects).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      "zerosort/directories/",
    );
    expect(listSyncObjects).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      "zerosort/images/",
    );
    expect(listSyncObjects).toHaveBeenCalledWith(
      "conn-1",
      "bucket-1",
      "zerosort/tags/",
    );
  });

  it("Should skip unparseable S3 objects", async () => {
    (listSyncObjects as any).mockResolvedValue([
      {
        key: "unknown/garbage.txt",
        size: 10,
        last_modified: "2024-01-01T00:00:00.000Z",
      },
      {
        key: "notes/valid.json",
        size: 100,
        last_modified: "2024-01-01T00:00:00.000Z",
      },
    ]);

    const entities = await collectRemoteState("conn-1", "bucket-1");

    // Only valid note should be collected (garbage repeated 4x but parsed as null)
    const noteEntity = entities.get("notes/valid.json");
    expect(noteEntity).toBeDefined();
    expect(noteEntity!.entityType).toBe("note");
  });

  it("Should handle empty remote bucket", async () => {
    (listSyncObjects as any).mockResolvedValue([]);

    const entities = await collectRemoteState("conn-1", "bucket-1");

    expect(entities.size).toBe(0);
  });
});

describe("Collector - collectPrevSyncState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Should convert all sync records to entities", async () => {
    const records: SyncRecord[] = [
      {
        id: "rec-1",
        entityId: "note-1",
        entityType: "note",
        key: "notes/note-1.json",
        localMtime: 1704067200000,
        remoteMtime: 1704067260000,
        size: 200,
        etag: '"abc"',
        syncedAt: "2024-01-01T00:00:00.000Z",
        profileId: "profile-1",
      },
      {
        id: "rec-2",
        entityId: "dir-1",
        entityType: "directory",
        key: "directories/dir-1.json",
        localMtime: 1704067200000,
        remoteMtime: 1704067200000,
        size: 64,
        syncedAt: "2024-01-01T00:00:00.000Z",
        profileId: "profile-1",
      },
    ];

    (getSyncRecordsByProfile as any).mockResolvedValue(records);

    const entities = await collectPrevSyncState("profile-1");

    expect(entities.size).toBe(2);
    expect(entities.has("notes/note-1.json")).toBe(true);
    expect(entities.has("directories/dir-1.json")).toBe(true);
    expect(getSyncRecordsByProfile).toHaveBeenCalledWith("profile-1");
  });

  it("Should handle empty sync records", async () => {
    (getSyncRecordsByProfile as any).mockResolvedValue([]);

    const entities = await collectPrevSyncState("profile-1");

    expect(entities.size).toBe(0);
  });
});

describe("Collector - healDirectorySyncAliases", () => {
  it("Should drop an aliased prevSync record that does not use the local canonical key", () => {
    const prevSync = new Map([
      [
        "directories/remote-dir.json",
        {
          id: "local-dir",
          entityType: "directory" as const,
          key: "directories/remote-dir.json",
          mtime: 1000,
          size: 40,
          localMtime: 1000,
          remoteMtime: 1000,
        },
      ],
    ]);

    healDirectorySyncAliases(prevSync);

    expect(prevSync.has("directories/remote-dir.json")).toBe(false);
    expect(prevSync.size).toBe(0);
  });

  it("Should leave matching directory keys unchanged", () => {
    const prevSync = new Map([
      [
        "directories/dir-1.json",
        {
          id: "dir-1",
          entityType: "directory" as const,
          key: "directories/dir-1.json",
          mtime: 1000,
          size: 40,
        },
      ],
    ]);

    healDirectorySyncAliases(prevSync);

    expect(prevSync.has("directories/dir-1.json")).toBe(true);
    expect(prevSync.size).toBe(1);
  });
});
