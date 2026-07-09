/**
 * Tests for the sync utils module.
 */

import { describe, expect, it } from "vitest";
import {
  compareMtimes,
  computeContentHash,
  deserializeDirectory,
  deserializeNote,
  extractEntityIdFromKey,
  formatDuration,
  getEntityTypeFromKey,
  getStringByteSize,
  mtimesAreEqual,
  normalizeMtime,
  parseIsoToMtime,
  parseS3Timestamp,
  serializeDirectory,
  serializeNote,
} from "../utils";

describe("Utils - Mtime Handling", () => {
  it("normalizeMtime should round down to seconds", () => {
    expect(normalizeMtime(1704067200500)).toBe(1704067200000);
    expect(normalizeMtime(1704067200999)).toBe(1704067200000);
    expect(normalizeMtime(1704067200000)).toBe(1704067200000);
  });

  it("parseIsoToMtime should parse ISO strings correctly", () => {
    const iso = "2024-01-01T00:00:00.000Z";
    expect(parseIsoToMtime(iso)).toBe(1704067200000);
    expect(parseIsoToMtime(undefined)).toBe(0);
    expect(parseIsoToMtime("invalid")).toBe(0);
  });

  it("parseS3Timestamp should parse S3 timestamps correctly", () => {
    const s3Ts = "2024-01-01T00:00:00.000Z";
    expect(parseS3Timestamp(s3Ts)).toBe(1704067200000);
    expect(parseS3Timestamp("invalid")).toBe(0);
  });

  it("mtimesAreEqual should consider times within same second equal", () => {
    expect(mtimesAreEqual(1704067200100, 1704067200900)).toBe(true);
    expect(mtimesAreEqual(1704067200000, 1704067201000)).toBe(false);
  });

  it("compareMtimes should return correct comparison values", () => {
    expect(compareMtimes(1704067201000, 1704067200000)).toBe(1);
    expect(compareMtimes(1704067200000, 1704067201000)).toBe(-1);
    expect(compareMtimes(1704067200100, 1704067200900)).toBe(0);
  });
});

describe("Utils - Hashing & Serialization", () => {
  it("computeContentHash should generate consistent hashes", () => {
    const content = "hello world";
    const hash = computeContentHash(content);
    expect(hash).toBe(computeContentHash(content));
    expect(hash).not.toBe(computeContentHash("hello world!"));
    expect(hash).toHaveLength(8);
  });

  it("serializeNote / deserializeNote should be reversible", async () => {
    const note: any = {
      id: "note-1",
      title: "Test Note",
      summary: "A summary",
      content: "Body content",
      directoryId: "dir-1",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:01:00.000Z",
    };

    const password = "test-password-123";
    const serialized = await serializeNote(note, password);
    const deserialized = await deserializeNote(serialized, password);

    expect(deserialized.id).toBe(note.id);
    expect(deserialized.title).toBe(note.title);
    expect(deserialized.content).toBe(note.content);
    expect(deserialized.updatedAt).toBe(note.updatedAt);
    expect(deserialized.isContentLoaded).toBe(true);
  });

  it("serializeDirectory / deserializeDirectory should be reversible", async () => {
    const directory: any = {
      id: "dir-1",
      name: "Test Dir",
      parentId: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    const password = "test-password-123";
    const serialized = await serializeDirectory(directory, password);
    const deserialized = await deserializeDirectory(serialized, password);

    expect(deserialized.id).toBe(directory.id);
    expect(deserialized.name).toBe(directory.name);
    expect(deserialized.parentId).toBe(directory.parentId);
    expect(deserialized.updatedAt).toBe(directory.updatedAt);
  });

  it("getStringByteSize should return correct size in bytes", () => {
    expect(getStringByteSize("hello")).toBe(5);
    expect(getStringByteSize("🔥")).toBe(4); // Fire emoji is 4 bytes in UTF-8
  });
});

describe("Utils - Key Parsing", () => {
  it("extractEntityIdFromKey should extract IDs correctly", () => {
    expect(extractEntityIdFromKey("notes/abc-123.json")).toBe("abc-123");
    expect(extractEntityIdFromKey("directories/dir-456.json")).toBe("dir-456");
    expect(extractEntityIdFromKey("other/file.txt")).toBe(null);
  });

  it("getEntityTypeFromKey should identify types correctly", () => {
    expect(getEntityTypeFromKey("notes/123.json")).toBe("note");
    expect(getEntityTypeFromKey("directories/456.json")).toBe("directory");
    expect(getEntityTypeFromKey("unknown/789.json")).toBe(null);
  });
});

describe("Utils - Formatting", () => {
  it("formatDuration should format milliseconds correctly", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(2000)).toBe("2.0s");
  });
});
