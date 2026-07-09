import { db } from "./index";

/**
 * Represents a sync record storing the "PrevSync" state.
 * This is the agreed-upon state after the last successful sync.
 *
 * The record stores two mtimes to support accurate three-way comparison:
 * - localMtime: The local entity's updatedAt timestamp
 * - remoteMtime: The S3 object's LastModified timestamp
 */
export interface SyncRecord {
  /** Unique identifier for the sync record */
  id: string;
  /** ID of the entity (note or directory) */
  entityId: string;
  /** Type of the entity */
  entityType: "note" | "directory" | "image" | "tag";
  /** S3 key path */
  key: string;
  /** Local modification time in milliseconds (from entity's updatedAt) */
  localMtime: number;
  /** Remote modification time in milliseconds (from S3 LastModified) */
  remoteMtime: number;
  /** Size of the serialized entity in bytes */
  size: number;
  /** ETag from S3 (for change detection) */
  etag?: string;
  /** Content hash for integrity verification */
  contentHash?: string;
  /** ISO timestamp of when this record was synced */
  syncedAt: string;
  /** ID of the sync profile this record belongs to */
  profileId: string;
}

/**
 * Initializes the sync_records table in the database.
 * Stores the "PrevSync" state for three-way comparison.
 *
 * Note: This drops and recreates the table to migrate from the old schema.
 * Sync records will be rebuilt on the next sync operation.
 */
export async function initSyncRecordsDb() {
  const existingTable = await db.select<Array<{ sql: string | null }>>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = $1",
    ["sync_records"],
  );

  const createTableSql = existingTable[0]?.sql ?? "";
  const supportsTagEntityType = createTableSql.includes("'tag'");

  if (createTableSql && !supportsTagEntityType) {
    await db.execute(`DROP TABLE IF EXISTS sync_records`);
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_records (
      id TEXT PRIMARY KEY,
      entityId TEXT NOT NULL,
      entityType TEXT NOT NULL CHECK (entityType IN ('note', 'directory', 'image', 'tag')),
      key TEXT NOT NULL,
      localMtime INTEGER NOT NULL,
      remoteMtime INTEGER NOT NULL,
      size INTEGER,
      etag TEXT,
      contentHash TEXT,
      syncedAt TEXT NOT NULL,
      profileId TEXT NOT NULL,
      UNIQUE(entityId, profileId)
    );
  `);

  // Index for efficient lookups
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_records_entity 
    ON sync_records(entityId, profileId);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_records_profile 
    ON sync_records(profileId);
  `);
}

/**
 * Retrieves all sync records for a given profile.
 *
 * @param profileId - The sync profile ID
 * @returns Array of sync records
 */
export async function getSyncRecordsByProfile(
  profileId: string,
): Promise<SyncRecord[]> {
  const rows = await db.select<SyncRecord[]>(
    "SELECT * FROM sync_records WHERE profileId = $1",
    [profileId],
  );
  return rows;
}

/**
 * Retrieves a sync record for a specific entity and profile.
 *
 * @param entityId - The entity ID
 * @param profileId - The sync profile ID
 * @returns The sync record or undefined if not found
 */
export async function getSyncRecord(
  entityId: string,
  profileId: string,
): Promise<SyncRecord | undefined> {
  const rows = await db.select<SyncRecord[]>(
    "SELECT * FROM sync_records WHERE entityId = $1 AND profileId = $2",
    [entityId, profileId],
  );
  return rows[0];
}

/**
 * Upserts a sync record for an entity.
 * Updates the PrevSync state after a successful sync operation.
 *
 * @param record - The sync record to upsert
 */
export async function upsertSyncRecord(
  record: Omit<SyncRecord, "id">,
): Promise<void> {
  const id = crypto.randomUUID();
  await db.execute(
    `
    INSERT INTO sync_records (id, entityId, entityType, key, localMtime, remoteMtime, size, etag, contentHash, syncedAt, profileId)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT(entityId, profileId) DO UPDATE SET
      entityType = excluded.entityType,
      key = excluded.key,
      localMtime = excluded.localMtime,
      remoteMtime = excluded.remoteMtime,
      size = excluded.size,
      etag = excluded.etag,
      contentHash = excluded.contentHash,
      syncedAt = excluded.syncedAt
  `,
    [
      id,
      record.entityId,
      record.entityType,
      record.key,
      record.localMtime,
      record.remoteMtime,
      record.size,
      record.etag,
      record.contentHash,
      record.syncedAt,
      record.profileId,
    ],
  );
}

/**
 * Bulk upserts sync records for efficiency.
 *
 * @param records - Array of sync records to upsert
 */
export async function bulkUpsertSyncRecords(
  records: Omit<SyncRecord, "id">[],
): Promise<void> {
  if (records.length === 0) return;

  const CHUNK_SIZE = 50;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const placeholders: string[] = [];
    const values: unknown[] = [];

    chunk.forEach((record, index) => {
      const base = index * 11;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`,
      );

      values.push(
        crypto.randomUUID(),
        record.entityId,
        record.entityType,
        record.key,
        record.localMtime,
        record.remoteMtime,
        record.size,
        record.etag,
        record.contentHash,
        record.syncedAt,
        record.profileId,
      );
    });

    const sql = `
      INSERT INTO sync_records (id, entityId, entityType, key, localMtime, remoteMtime, size, etag, contentHash, syncedAt, profileId)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT(entityId, profileId) DO UPDATE SET
        entityType = excluded.entityType,
        key = excluded.key,
        localMtime = excluded.localMtime,
        remoteMtime = excluded.remoteMtime,
        size = excluded.size,
        etag = excluded.etag,
        contentHash = excluded.contentHash,
        syncedAt = excluded.syncedAt
    `;

    await db.execute(sql, values);
  }
}

/**
 * Deletes a sync record for a specific entity.
 *
 * @param entityId - The entity ID
 * @param profileId - The sync profile ID
 */
export async function deleteSyncRecord(
  entityId: string,
  profileId: string,
): Promise<void> {
  await db.execute(
    "DELETE FROM sync_records WHERE entityId = $1 AND profileId = $2",
    [entityId, profileId],
  );
}

/**
 * Deletes all sync records for a profile.
 * Used when resetting sync state or deleting a profile.
 *
 * @param profileId - The sync profile ID
 */
export async function clearSyncRecordsByProfile(
  profileId: string,
): Promise<void> {
  await db.execute("DELETE FROM sync_records WHERE profileId = $1", [
    profileId,
  ]);
}

/**
 * Deletes sync records for entities that no longer exist.
 * Called during cleanup phase of sync.
 *
 * @param entityIds - Array of entity IDs to delete records for
 * @param profileId - The sync profile ID
 */
export async function deleteSyncRecordsByEntityIds(
  entityIds: string[],
  profileId: string,
): Promise<void> {
  if (entityIds.length === 0) return;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < entityIds.length; i += CHUNK_SIZE) {
    const chunk = entityIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map((_, index) => `$${index + 2}`).join(", ");
    await db.execute(
      `DELETE FROM sync_records WHERE profileId = $1 AND entityId IN (${placeholders})`,
      [profileId, ...chunk],
    );
  }
}
