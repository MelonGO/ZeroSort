/**
 * Test utilities and mock data generators for sync testing.
 * Provides helpers to create mock SyncEntity, MixedEntity, and related types.
 */

import type { MixedEntity, SyncEntity } from "@/types/sync";

// Base timestamp for consistent testing
const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

/**
 * Creates a mock SyncEntity for testing.
 */
export function createMockSyncEntity(
  overrides: Partial<SyncEntity> & {
    id: string;
    entityType: "note" | "directory" | "image";
  },
): SyncEntity {
  const key =
    overrides.key ??
    (overrides.entityType === "image"
      ? overrides.id
      : `${overrides.entityType}s/${overrides.id}.json`);

  return {
    id: overrides.id,
    entityType: overrides.entityType,
    key,
    mtime: overrides.mtime ?? BASE_TIME,
    size: overrides.size ?? 100,
    etag: overrides.etag ?? `"${overrides.id}-etag"`,
    contentHash: overrides.contentHash,
    localMtime: overrides.localMtime,
    remoteMtime: overrides.remoteMtime,
  };
}

/**
 * Creates a mock MixedEntity for testing.
 */
export function createMockMixedEntity(
  key: string,
  options: {
    local?: Partial<SyncEntity> & {
      id: string;
      entityType: "note" | "directory" | "image";
    };
    remote?: Partial<SyncEntity> & {
      id: string;
      entityType: "note" | "directory" | "image";
    };
    prevSync?: Partial<SyncEntity> & {
      id: string;
      entityType: "note" | "directory" | "image";
    };
  },
): MixedEntity {
  const entity: MixedEntity = { key };

  if (options.local) {
    entity.local = createMockSyncEntity({
      ...options.local,
      key,
    });
  }

  if (options.remote) {
    entity.remote = createMockSyncEntity({
      ...options.remote,
      key,
    });
  }

  if (options.prevSync) {
    entity.prevSync = createMockSyncEntity({
      ...options.prevSync,
      key,
    });
  }

  return entity;
}

/**
 * Creates a test scenario with specific timing relationships.
 */
export function createScenario(
  type:
    | "both-equal"
    | "local-newer"
    | "remote-newer"
    | "both-modified"
    | "local-only"
    | "remote-only"
    | "both-deleted",
  entityType: "note" | "directory" | "image" = "note",
): MixedEntity {
  const id = `test-${type}`;
  const key =
    entityType === "image" ? `images/${id}.png` : `${entityType}s/${id}.json`;

  switch (type) {
    case "both-equal":
      return createMockMixedEntity(key, {
        local: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
        remote: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
        prevSync: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    case "local-newer":
      return createMockMixedEntity(key, {
        local: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME + 60000,
        },
        remote: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
        prevSync: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    case "remote-newer":
      return createMockMixedEntity(key, {
        local: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
        remote: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME + 60000,
        },
        prevSync: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    case "both-modified":
      return createMockMixedEntity(key, {
        local: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME + 120000,
        },
        remote: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME + 60000,
        },
        prevSync: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    case "local-only":
      return createMockMixedEntity(key, {
        local: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    case "remote-only":
      return createMockMixedEntity(key, {
        remote: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    case "both-deleted":
      return createMockMixedEntity(key, {
        prevSync: {
          id: entityType === "image" ? key : id,
          entityType,
          mtime: BASE_TIME,
        },
      });

    default:
      throw new Error(`Unknown scenario type: ${type}`);
  }
}

/**
 * Creates a MixedEntityMap from an array of MixedEntities.
 */
export function createEntityMap(
  entities: MixedEntity[],
): Map<string, MixedEntity> {
  const map = new Map<string, MixedEntity>();
  for (const entity of entities) {
    map.set(entity.key, entity);
  }
  return map;
}

/**
 * Creates a test sync plan with specific counts.
 */
export function createMockSyncPlan(options: {
  uploads?: number;
  downloads?: number;
  localDeletes?: number;
  remoteDeletes?: number;
  conflicts?: number;
  unchanged?: number;
}) {
  const uploads = [];
  const downloads = [];
  const localDeletes = [];
  const remoteDeletes = [];
  const unchanged = [];

  for (let i = 0; i < (options.uploads ?? 0); i++) {
    uploads.push(
      createMockMixedEntity(`notes/upload-${i}.json`, {
        local: { id: `upload-${i}`, entityType: "note" },
      }),
    );
  }

  for (let i = 0; i < (options.downloads ?? 0); i++) {
    downloads.push(
      createMockMixedEntity(`notes/download-${i}.json`, {
        remote: { id: `download-${i}`, entityType: "note" },
      }),
    );
  }

  for (let i = 0; i < (options.localDeletes ?? 0); i++) {
    localDeletes.push(
      createMockMixedEntity(`notes/local-delete-${i}.json`, {
        prevSync: { id: `local-delete-${i}`, entityType: "note" },
      }),
    );
  }

  for (let i = 0; i < (options.remoteDeletes ?? 0); i++) {
    remoteDeletes.push(
      createMockMixedEntity(`notes/remote-delete-${i}.json`, {
        prevSync: { id: `remote-delete-${i}`, entityType: "note" },
      }),
    );
  }

  for (let i = 0; i < (options.unchanged ?? 0); i++) {
    unchanged.push(
      createMockMixedEntity(`notes/unchanged-${i}.json`, {
        local: { id: `unchanged-${i}`, entityType: "note" },
        remote: { id: `unchanged-${i}`, entityType: "note" },
        prevSync: { id: `unchanged-${i}`, entityType: "note" },
      }),
    );
  }

  for (let i = 0; i < (options.conflicts ?? 0); i++) {
    const id = `conflict-${i}`;
    const key = `notes/conflict-${i}.json`;
    const entity = createMockMixedEntity(key, {
      local: { id, entityType: "note", mtime: BASE_TIME + 2000 },
      remote: { id, entityType: "note", mtime: BASE_TIME + 1000 },
      prevSync: { id, entityType: "note", mtime: BASE_TIME },
    });
    entity.decision = "conflict_modified_then_keep_local";
    uploads.push(entity);
  }

  return {
    uploads,
    downloads,
    localDeletes,
    remoteDeletes,
    conflicts: [], // We don't use this bucket in planner yet, but the interface requires it
    unchanged,
  };
}
