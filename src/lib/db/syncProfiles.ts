import { normalizeSyncPrefix } from "@/lib/sync/prefix";
import { db } from "./index";

type SyncProfileInput = Omit<SyncProfile, "id" | "createdAt">;

let activeProfileCreationPromise: Promise<SyncProfile> | null = null;

async function hasSyncProfilesColumn(columnName: string): Promise<boolean> {
  const rows = await db.select<Array<{ name: string }>>(
    "PRAGMA table_info(sync_profiles)",
  );

  return rows.some((row) => row.name === columnName);
}

async function normalizeActiveSyncProfiles(): Promise<string | null> {
  const rows = await db.select<Array<{ id: string }>>(
    `SELECT id FROM sync_profiles WHERE isActive = 1 ORDER BY datetime(createdAt) DESC, createdAt DESC`,
  );

  if (rows.length === 0) {
    return null;
  }

  const [activeProfile, ...duplicates] = rows;
  if (duplicates.length === 0) {
    return activeProfile.id;
  }

  const placeholders = duplicates.map((_, index) => `$${index + 1}`).join(", ");
  await db.execute(
    `UPDATE sync_profiles SET isActive = 0 WHERE id IN (${placeholders})`,
    duplicates.map((profile) => profile.id),
  );

  return activeProfile.id;
}

/**
 * Represents a sync profile configuration.
 * Stores S3 connection metadata (credentials are stored securely in keyring).
 */
export interface SyncProfile {
  /** Unique identifier for the profile */
  id: string;
  /** Human-readable label for the profile */
  label: string;
  /** Storage service type (currently only 's3') */
  serviceType: "s3";
  /** AWS region or custom region for S3-compatible services */
  region: string;
  /** S3 endpoint URL */
  endpointUrl: string;
  /** Target bucket name */
  bucketName: string;
  /** Prefix for all sync objects (e.g., "zerosort/") */
  prefix: string;
  /** ISO timestamp of when the profile was created */
  createdAt: string;
  /** ISO timestamp of the last successful sync */
  lastSyncAt?: string;
  /** Whether this profile is currently active */
  isActive: boolean;
  /** Bucket name used during the last successful sync (for bucket change detection) */
  lastSyncedBucketName?: string;
  /** Endpoint URL used during the last successful sync (for provider migration detection) */
  lastSyncedEndpointUrl?: string;
}

function mapRowToSyncProfile(row: Record<string, unknown>): SyncProfile {
  return {
    ...(row as unknown as SyncProfile),
    prefix: normalizeSyncPrefix(
      (row.prefix as string | null | undefined) ?? "",
    ),
    isActive: Boolean(row.isActive),
  };
}

/**
 * Initializes the sync_profiles table in the database.
 * Stores S3 connection metadata (credentials stored separately in keyring).
 */
export async function initSyncProfilesDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sync_profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      serviceType TEXT DEFAULT 's3',
      region TEXT NOT NULL,
      endpointUrl TEXT NOT NULL,
      bucketName TEXT NOT NULL,
      prefix TEXT DEFAULT 'zerosort/',
      createdAt TEXT NOT NULL,
      lastSyncAt TEXT,
      isActive INTEGER DEFAULT 1,
      lastSyncedBucketName TEXT,
      lastSyncedEndpointUrl TEXT
    );
  `);

  // Migrate existing tables: add bucket change detection columns
  if (!(await hasSyncProfilesColumn("lastSyncedBucketName"))) {
    await db.execute(
      `ALTER TABLE sync_profiles ADD COLUMN lastSyncedBucketName TEXT`,
    );
  }

  if (!(await hasSyncProfilesColumn("lastSyncedEndpointUrl"))) {
    await db.execute(
      `ALTER TABLE sync_profiles ADD COLUMN lastSyncedEndpointUrl TEXT`,
    );
  }
}

/**
 * Retrieves all sync profiles from the database.
 *
 * @returns Array of sync profiles
 */
export async function getAllSyncProfiles(): Promise<SyncProfile[]> {
  const rows = await db.select<any[]>("SELECT * FROM sync_profiles");
  return rows.map(mapRowToSyncProfile);
}

/**
 * Retrieves a sync profile by its ID.
 *
 * @param id - The profile ID
 * @returns The sync profile or undefined if not found
 */
export async function getSyncProfileById(
  id: string,
): Promise<SyncProfile | undefined> {
  const rows = await db.select<any[]>(
    "SELECT * FROM sync_profiles WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return undefined;
  return mapRowToSyncProfile(rows[0]);
}

/**
 * Retrieves the currently active sync profile.
 *
 * @returns The active sync profile or undefined if none is active
 */
export async function getActiveSyncProfile(): Promise<SyncProfile | undefined> {
  const activeId = await normalizeActiveSyncProfiles();
  if (!activeId) return undefined;

  const rows = await db.select<any[]>(
    "SELECT * FROM sync_profiles WHERE id = $1 LIMIT 1",
    [activeId],
  );
  if (rows.length === 0) return undefined;
  return mapRowToSyncProfile(rows[0]);
}

/**
 * Creates a new sync profile.
 *
 * @param profile - The profile to create (without id and createdAt)
 * @returns The created profile with generated id and createdAt
 */
export async function createSyncProfile(
  profile: SyncProfileInput,
): Promise<SyncProfile> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const prefix = normalizeSyncPrefix(profile.prefix);

  if (profile.isActive) {
    await db.execute(
      "UPDATE sync_profiles SET isActive = 0 WHERE isActive = 1",
    );
  }

  await db.execute(
    `
    INSERT INTO sync_profiles (id, label, serviceType, region, endpointUrl, bucketName, prefix, createdAt, lastSyncAt, isActive)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `,
    [
      id,
      profile.label,
      profile.serviceType,
      profile.region,
      profile.endpointUrl,
      profile.bucketName,
      prefix,
      createdAt,
      profile.lastSyncAt || null,
      profile.isActive ? 1 : 0,
    ],
  );

  return {
    ...profile,
    prefix,
    id,
    createdAt,
  };
}

/**
 * Retrieves the active sync profile or creates one exactly once for concurrent callers.
 */
export async function getOrCreateActiveSyncProfile(
  profile: SyncProfileInput,
): Promise<SyncProfile> {
  const existingProfile = await getActiveSyncProfile();
  if (existingProfile) {
    return existingProfile;
  }

  if (activeProfileCreationPromise) {
    return activeProfileCreationPromise;
  }

  activeProfileCreationPromise = (async () => {
    const activeProfile = await getActiveSyncProfile();
    if (activeProfile) {
      return activeProfile;
    }

    return createSyncProfile({
      ...profile,
      isActive: true,
    });
  })();

  try {
    return await activeProfileCreationPromise;
  } finally {
    activeProfileCreationPromise = null;
  }
}

/**
 * Updates an existing sync profile.
 *
 * @param id - The profile ID
 * @param updates - Partial profile updates
 */
export async function updateSyncProfile(
  id: string,
  updates: Partial<Omit<SyncProfile, "id" | "createdAt">>,
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.label !== undefined) {
    setClauses.push(`label = $${paramIndex++}`);
    values.push(updates.label);
  }
  if (updates.region !== undefined) {
    setClauses.push(`region = $${paramIndex++}`);
    values.push(updates.region);
  }
  if (updates.endpointUrl !== undefined) {
    setClauses.push(`endpointUrl = $${paramIndex++}`);
    values.push(updates.endpointUrl);
  }
  if (updates.bucketName !== undefined) {
    setClauses.push(`bucketName = $${paramIndex++}`);
    values.push(updates.bucketName);
  }
  if (updates.prefix !== undefined) {
    setClauses.push(`prefix = $${paramIndex++}`);
    values.push(normalizeSyncPrefix(updates.prefix));
  }
  if (updates.lastSyncAt !== undefined) {
    setClauses.push(`lastSyncAt = $${paramIndex++}`);
    values.push(updates.lastSyncAt);
  }
  if (updates.isActive !== undefined) {
    setClauses.push(`isActive = $${paramIndex++}`);
    values.push(updates.isActive ? 1 : 0);
  }
  if (updates.lastSyncedBucketName !== undefined) {
    setClauses.push(`lastSyncedBucketName = $${paramIndex++}`);
    values.push(updates.lastSyncedBucketName);
  }
  if (updates.lastSyncedEndpointUrl !== undefined) {
    setClauses.push(`lastSyncedEndpointUrl = $${paramIndex++}`);
    values.push(updates.lastSyncedEndpointUrl);
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await db.execute(
    `UPDATE sync_profiles SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
    values,
  );
}

/**
 * Updates the lastSyncAt timestamp for a profile.
 *
 * @param id - The profile ID
 * @param timestamp - ISO timestamp of the sync (defaults to now)
 */
export async function updateProfileLastSync(
  id: string,
  timestamp?: string,
): Promise<void> {
  const syncTime = timestamp || new Date().toISOString();
  await db.execute("UPDATE sync_profiles SET lastSyncAt = $1 WHERE id = $2", [
    syncTime,
    id,
  ]);
}

/**
 * Sets a profile as the active profile.
 * Deactivates all other profiles.
 *
 * @param id - The profile ID to activate
 */
export async function setActiveProfile(id: string): Promise<void> {
  // Deactivate all profiles
  await db.execute("UPDATE sync_profiles SET isActive = 0");
  // Activate the selected profile
  await db.execute("UPDATE sync_profiles SET isActive = 1 WHERE id = $1", [id]);
}

/**
 * Deletes a sync profile and its associated sync records.
 *
 * @param id - The profile ID to delete
 */
export async function deleteSyncProfile(id: string): Promise<void> {
  // Delete associated sync records first
  await db.execute("DELETE FROM sync_records WHERE profileId = $1", [id]);
  // Delete the profile
  await db.execute("DELETE FROM sync_profiles WHERE id = $1", [id]);
}
