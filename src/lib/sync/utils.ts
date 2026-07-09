/**
 * Sync utility functions for the Three-Way Comparison Model.
 *
 * Provides helpers for mtime normalization, hashing, and entity serialization.
 */

import type { Directory, Note, Tag } from "@/types";
import { parseSyncKey, type SyncEntityType } from "@/types/sync";
import { decryptSyncContent, encryptSyncContent } from "./encryption";

const textEncoder = new TextEncoder();

/**
 * Normalizes a timestamp to seconds precision for S3 compatibility.
 * S3 only stores timestamps with second precision, so we round down
 * milliseconds to avoid false positives in mtime comparisons.
 *
 * @param mtime - Timestamp in milliseconds
 * @returns Normalized timestamp in milliseconds (rounded to seconds)
 */
export function normalizeMtime(mtime: number): number {
  return Math.floor(mtime / 1000) * 1000;
}

/**
 * Parses an ISO date string to a Unix timestamp in milliseconds.
 *
 * @param isoString - ISO 8601 date string
 * @returns Unix timestamp in milliseconds, or 0 if invalid
 */
export function parseIsoToMtime(isoString: string | undefined | null): number {
  if (!isoString) return 0;
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/**
 * Parses an S3 LastModified string to a Unix timestamp.
 * S3 returns timestamps in format like "2024-01-15T10:30:00.000Z".
 *
 * @param s3Timestamp - S3 LastModified timestamp string
 * @returns Unix timestamp in milliseconds
 */
export function parseS3Timestamp(s3Timestamp: string): number {
  // S3 timestamps may have various formats, attempt parsing
  const date = new Date(s3Timestamp);
  if (Number.isNaN(date.getTime())) {
    console.warn(`Failed to parse S3 timestamp: ${s3Timestamp}`);
    return 0;
  }
  return date.getTime();
}

/**
 * Computes a simple hash of a string for content comparison.
 * Uses a fast non-cryptographic hash suitable for change detection.
 *
 * @param content - String content to hash
 * @returns Hash string
 */
export function computeContentHash(content: string): string {
  // Simple FNV-1a hash implementation
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Convert to hex string
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Serializes a Note to JSON for S3 storage with encrypted sensitive fields.
 * Encrypts: title, summary, content
 * Plaintext: id, directoryId, createdAt, updatedAt
 *
 * @param note - Note to serialize
 * @param password - Encryption password for sensitive fields
 * @returns JSON string with encrypted fields
 */
export async function serializeNote(
  note: Note,
  password: string,
): Promise<string> {
  const [encryptedTitle, encryptedSummary, encryptedContent] =
    await Promise.all([
      encryptSyncContent(note.title, password),
      encryptSyncContent(note.summary || "", password),
      encryptSyncContent(note.content || "", password),
    ]);

  return JSON.stringify({
    id: note.id,
    title: encryptedTitle,
    summary: encryptedSummary,
    content: encryptedContent,
    directoryId: note.directoryId,
    tagIds: note.tagIds || [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    _encrypted: true,
  });
}

/**
 * Deserializes a Note from JSON with decryption support.
 * Automatically detects encrypted vs legacy unencrypted format.
 *
 * @param json - JSON string (possibly with encrypted fields)
 * @param password - Decryption password for encrypted fields
 * @returns Parsed Note object with decrypted content
 */
export async function deserializeNote(
  json: string,
  password: string,
): Promise<Note> {
  const parsed = JSON.parse(json);

  // Check if this is encrypted data
  if (parsed._encrypted) {
    const [title, summary, content] = await Promise.all([
      decryptSyncContent(parsed.title, password),
      decryptSyncContent(parsed.summary, password),
      decryptSyncContent(parsed.content, password),
    ]);

    return {
      id: parsed.id,
      title,
      summary,
      content,
      directoryId: parsed.directoryId || null,
      tagIds: parsed.tagIds || [],
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt,
      isContentLoaded: true,
    };
  }

  // Legacy unencrypted format
  return {
    id: parsed.id,
    title: parsed.title || "",
    summary: parsed.summary || "",
    content: parsed.content || "",
    directoryId: parsed.directoryId || null,
    tagIds: parsed.tagIds || [],
    createdAt: parsed.createdAt || new Date().toISOString(),
    updatedAt: parsed.updatedAt,
    isContentLoaded: true,
  };
}

/**
 * Serializes a Directory to JSON for S3 storage with encrypted name.
 * Encrypts: name
 * Plaintext: id, parentId, updatedAt
 *
 * @param directory - Directory to serialize
 * @param password - Encryption password for sensitive fields
 * @returns JSON string with encrypted name
 */
export async function serializeDirectory(
  directory: Directory,
  password: string,
): Promise<string> {
  const encryptedName = await encryptSyncContent(directory.name, password);

  return JSON.stringify({
    id: directory.id,
    name: encryptedName,
    parentId: directory.parentId,
    updatedAt: directory.updatedAt,
    _encrypted: true,
  });
}

/**
 * Deserializes a Directory from JSON with decryption support.
 * Automatically detects encrypted vs legacy unencrypted format.
 *
 * @param json - JSON string (possibly with encrypted name)
 * @param password - Decryption password for encrypted fields
 * @returns Parsed Directory object with decrypted name
 */
export async function deserializeDirectory(
  json: string,
  password: string,
): Promise<Directory> {
  const parsed = JSON.parse(json);

  // Check if this is encrypted data
  if (parsed._encrypted) {
    const name = await decryptSyncContent(parsed.name, password);

    return {
      id: parsed.id,
      name,
      parentId: parsed.parentId || null,
      updatedAt: parsed.updatedAt,
    };
  }

  // Legacy unencrypted format
  return {
    id: parsed.id,
    name: parsed.name || "",
    parentId: parsed.parentId || null,
    updatedAt: parsed.updatedAt,
  };
}

/**
 * Serializes a Tag to JSON for S3 storage with encrypted name.
 */
export async function serializeTag(
  tag: Tag,
  password: string,
): Promise<string> {
  const encryptedName = await encryptSyncContent(tag.name, password);

  return JSON.stringify({
    id: tag.id,
    name: encryptedName,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
    _encrypted: true,
  });
}

/**
 * Deserializes a Tag from JSON with decryption support.
 */
export async function deserializeTag(
  json: string,
  password: string,
): Promise<Tag> {
  const parsed = JSON.parse(json);

  if (parsed._encrypted) {
    const name = await decryptSyncContent(parsed.name, password);
    return {
      id: parsed.id,
      name,
      color: parsed.color || null,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt,
    };
  }

  return {
    id: parsed.id,
    name: parsed.name || "",
    color: parsed.color || null,
    createdAt: parsed.createdAt || new Date().toISOString(),
    updatedAt: parsed.updatedAt,
  };
}

/**
 * Estimates the serialized size of a Tag without encryption.
 */
export function estimateTagSize(tag: Tag): number {
  const json = JSON.stringify({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  });
  return Math.ceil(getStringByteSize(json) * 1.3);
}

/**
 * Calculates the byte size of a string (UTF-8).
 *
 * @param str - String to measure
 * @returns Size in bytes
 */
export function getStringByteSize(str: string): number {
  return textEncoder.encode(str).length;
}

/**
 * Compares two mtimes with tolerance for S3 precision.
 * Considers times equal if they're within 1 second of each other.
 *
 * @param mtime1 - First timestamp in milliseconds
 * @param mtime2 - Second timestamp in milliseconds
 * @returns true if times are considered equal
 */
export function mtimesAreEqual(mtime1: number, mtime2: number): boolean {
  const normalized1 = normalizeMtime(mtime1);
  const normalized2 = normalizeMtime(mtime2);
  return normalized1 === normalized2;
}

/**
 * Determines which mtime is newer.
 *
 * @param mtime1 - First timestamp
 * @param mtime2 - Second timestamp
 * @returns 1 if mtime1 is newer, -1 if mtime2 is newer, 0 if equal
 */
export function compareMtimes(mtime1: number, mtime2: number): -1 | 0 | 1 {
  const normalized1 = normalizeMtime(mtime1);
  const normalized2 = normalizeMtime(mtime2);
  if (normalized1 > normalized2) return 1;
  if (normalized1 < normalized2) return -1;
  return 0;
}

/**
 * Extracts the entity ID from an S3 key.
 *
 * @param key - S3 key path (e.g., "notes/abc-123.json")
 * @returns Entity ID or null if invalid
 */
export function extractEntityIdFromKey(key: string): string | null {
  return parseSyncKey(key)?.id ?? null;
}

/**
 * Determines the entity type from an S3 key.
 *
 * @param key - S3 key path
 * @returns Entity type or null if invalid
 */
export function getEntityTypeFromKey(key: string): SyncEntityType | null {
  return parseSyncKey(key)?.entityType ?? null;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.5s", "500ms")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Estimates the serialized size of a Note without encryption.
 * Used for progress tracking and size estimation during planning phase.
 * The actual encrypted size will be slightly larger due to encryption overhead.
 *
 * @param note - Note to estimate size for
 * @returns Estimated size in bytes
 */
export function estimateNoteSize(note: Note): number {
  const json = JSON.stringify({
    id: note.id,
    title: note.title,
    summary: note.summary || "",
    content: note.content || "",
    directoryId: note.directoryId,
    tagIds: note.tagIds || [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  });
  // Add ~30% overhead for encryption (salt, IV, base64 encoding)
  return Math.ceil(getStringByteSize(json) * 1.3);
}

/**
 * Estimates the serialized size of a Directory without encryption.
 * Used for progress tracking and size estimation during planning phase.
 *
 * @param directory - Directory to estimate size for
 * @returns Estimated size in bytes
 */
export function estimateDirectorySize(directory: Directory): number {
  const json = JSON.stringify({
    id: directory.id,
    name: directory.name,
    parentId: directory.parentId,
    updatedAt: directory.updatedAt,
  });
  // Add ~30% overhead for encryption (salt, IV, base64 encoding)
  return Math.ceil(getStringByteSize(json) * 1.3);
}
