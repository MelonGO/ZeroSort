import { db } from "./index";

/**
 * Represents a sync operation log entry.
 * Used for debugging and history tracking.
 */
export interface SyncLog {
  /** Unique identifier for the log entry */
  id: string;
  /** ID of the sync profile used */
  profileId: string;
  /** ISO timestamp when the sync started */
  startedAt: string;
  /** ISO timestamp when the sync completed */
  completedAt?: string;
  /** Current status of the sync operation */
  status: "running" | "success" | "failed" | "cancelled";
  /** JSON string containing the sync plan summary */
  planSummary?: string;
  /** Error message if the sync failed */
  errorMessage?: string;
  /** Number of items uploaded */
  uploadCount: number;
  /** Number of items downloaded */
  downloadCount: number;
  /** Number of items deleted */
  deleteCount: number;
  /** Number of conflicts encountered */
  conflictCount: number;
}

/**
 * Summary of a sync plan for logging purposes.
 */
export interface SyncPlanLogSummary {
  totalItems: number;
  uploads: number;
  downloads: number;
  localDeletes: number;
  remoteDeletes: number;
  conflicts: number;
  unchanged: number;
}

/**
 * Initializes the sync_logs table in the database.
 */
export async function initSyncLogsDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      profileId TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      completedAt TEXT,
      status TEXT CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
      planSummary TEXT,
      errorMessage TEXT,
      uploadCount INTEGER DEFAULT 0,
      downloadCount INTEGER DEFAULT 0,
      deleteCount INTEGER DEFAULT 0,
      conflictCount INTEGER DEFAULT 0
    );
  `);

  // Index for efficient lookups by profile
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sync_logs_profile 
    ON sync_logs(profileId, startedAt DESC);
  `);
}

/**
 * Creates a new sync log entry when a sync operation starts.
 *
 * @param profileId - The sync profile ID
 * @returns The created log entry ID
 */
export async function createSyncLog(profileId: string): Promise<string> {
  const id = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  await db.execute(
    `
    INSERT INTO sync_logs (id, profileId, startedAt, status, uploadCount, downloadCount, deleteCount, conflictCount)
    VALUES ($1, $2, $3, 'running', 0, 0, 0, 0)
  `,
    [id, profileId, startedAt],
  );

  return id;
}

/**
 * Updates a sync log with plan summary.
 *
 * @param logId - The log entry ID
 * @param summary - The sync plan summary
 */
export async function updateSyncLogPlan(
  logId: string,
  summary: SyncPlanLogSummary,
): Promise<void> {
  await db.execute("UPDATE sync_logs SET planSummary = $1 WHERE id = $2", [
    JSON.stringify(summary),
    logId,
  ]);
}

/**
 * Marks a sync log as completed successfully.
 *
 * @param logId - The log entry ID
 * @param counts - The final operation counts
 */
export async function completeSyncLog(
  logId: string,
  counts: {
    uploadCount: number;
    downloadCount: number;
    deleteCount: number;
    conflictCount: number;
  },
): Promise<void> {
  const completedAt = new Date().toISOString();

  await db.execute(
    `
    UPDATE sync_logs 
    SET status = 'success', 
        completedAt = $1, 
        uploadCount = $2, 
        downloadCount = $3, 
        deleteCount = $4, 
        conflictCount = $5
    WHERE id = $6
  `,
    [
      completedAt,
      counts.uploadCount,
      counts.downloadCount,
      counts.deleteCount,
      counts.conflictCount,
      logId,
    ],
  );
}

/**
 * Marks a sync log as failed.
 *
 * @param logId - The log entry ID
 * @param errorMessage - The error message
 */
export async function failSyncLog(
  logId: string,
  errorMessage: string,
): Promise<void> {
  const completedAt = new Date().toISOString();

  await db.execute(
    `
    UPDATE sync_logs 
    SET status = 'failed', completedAt = $1, errorMessage = $2
    WHERE id = $3
  `,
    [completedAt, errorMessage, logId],
  );
}

/**
 * Marks a sync log as cancelled.
 *
 * @param logId - The log entry ID
 */
export async function cancelSyncLog(logId: string): Promise<void> {
  const completedAt = new Date().toISOString();

  await db.execute(
    `
    UPDATE sync_logs 
    SET status = 'cancelled', completedAt = $1
    WHERE id = $2
  `,
    [completedAt, logId],
  );
}

/**
 * Retrieves recent sync logs for a profile.
 *
 * @param profileId - The sync profile ID
 * @param limit - Maximum number of logs to return (default 10)
 * @returns Array of sync logs, most recent first
 */
export async function getSyncLogsByProfile(
  profileId: string,
  limit = 10,
): Promise<SyncLog[]> {
  const rows = await db.select<SyncLog[]>(
    `
    SELECT * FROM sync_logs 
    WHERE profileId = $1 
    ORDER BY startedAt DESC 
    LIMIT $2
  `,
    [profileId, limit],
  );
  return rows;
}

/**
 * Retrieves the most recent sync log for a profile.
 *
 * @param profileId - The sync profile ID
 * @returns The most recent sync log or undefined
 */
export async function getLastSyncLog(
  profileId: string,
): Promise<SyncLog | undefined> {
  const logs = await getSyncLogsByProfile(profileId, 1);
  return logs[0];
}

/**
 * Deletes old sync logs to prevent database bloat.
 * Keeps the most recent logs per profile.
 *
 * @param keepCount - Number of logs to keep per profile (default 50)
 */
export async function cleanupOldSyncLogs(keepCount = 50): Promise<void> {
  await db.execute(
    `
    DELETE FROM sync_logs 
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, profileId, 
               ROW_NUMBER() OVER (PARTITION BY profileId ORDER BY startedAt DESC) as rn
        FROM sync_logs
      ) ranked
      WHERE rn <= $1
    )
  `,
    [keepCount],
  );
}
