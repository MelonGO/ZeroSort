/**
 * Tests for the sync ensemble module - Three-Way Comparison entity combination.
 */

import { describe, expect, it } from "vitest";
import type { CollectedState } from "../collector";
import {
  ensembleMixedEntities,
  entitiesAreEqual,
  entityNeedsAction,
  filterChangedEntities,
  getEntityStats,
  groupByEntityType,
  localEqualsPrevSync,
  remoteEqualsPrevSync,
} from "../ensemble";
import {
  createEntityMap,
  createMockMixedEntity,
  createMockSyncEntity,
  createScenario,
} from "./test-utils";

describe("Ensemble - Mixed Entity Creation", () => {
  it("Should combine all three states into MixedEntity map", () => {
    const localEntity = createMockSyncEntity({
      id: "local-1",
      entityType: "note",
      mtime: 1000,
    });
    const remoteEntity = createMockSyncEntity({
      id: "remote-1",
      entityType: "note",
      mtime: 1000,
    });
    const prevSyncEntity = createMockSyncEntity({
      id: "prev-1",
      entityType: "note",
      mtime: 1000,
    });

    const state: CollectedState = {
      local: new Map([["notes/local-1.json", localEntity]]),
      remote: new Map([["notes/remote-1.json", remoteEntity]]),
      prevSync: new Map([["notes/prev-1.json", prevSyncEntity]]),
      localImageReferences: new Set(),
      unsafeLocalImages: new Map(),
    };

    const mixed = ensembleMixedEntities(state);

    expect(mixed.size).toBe(3);
    expect(mixed.get("notes/local-1.json")?.local).toBe(localEntity);
    expect(mixed.get("notes/remote-1.json")?.remote).toBe(remoteEntity);
    expect(mixed.get("notes/prev-1.json")?.prevSync).toBe(prevSyncEntity);
  });

  it("Should merge entities with same key from different sources", () => {
    const localEntity = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 1000,
    });
    const remoteEntity = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 2000,
    });
    const prevSyncEntity = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 500,
    });

    const state: CollectedState = {
      local: new Map([["notes/same.json", localEntity]]),
      remote: new Map([["notes/same.json", remoteEntity]]),
      prevSync: new Map([["notes/same.json", prevSyncEntity]]),
      localImageReferences: new Set(),
      unsafeLocalImages: new Map(),
    };

    const mixed = ensembleMixedEntities(state);

    expect(mixed.size).toBe(1);
    const entity = mixed.get("notes/same.json");
    expect(entity?.local).toBe(localEntity);
    expect(entity?.remote).toBe(remoteEntity);
    expect(entity?.prevSync).toBe(prevSyncEntity);
  });

  it("Should handle empty states", () => {
    const state: CollectedState = {
      local: new Map(),
      remote: new Map(),
      prevSync: new Map(),
      localImageReferences: new Set(),
      unsafeLocalImages: new Map(),
    };

    const mixed = ensembleMixedEntities(state);

    expect(mixed.size).toBe(0);
  });
});

describe("Ensemble - Entity Equality", () => {
  it("Should consider identical entities equal", () => {
    const entity1 = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 1000,
      size: 100,
    });
    const entity2 = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 1000,
      size: 100,
    });

    expect(entitiesAreEqual(entity1, entity2)).toBe(true);
  });

  it("Should detect different mtimes", () => {
    const entity1 = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 1000,
    });
    const entity2 = createMockSyncEntity({
      id: "same",
      entityType: "note",
      mtime: 2000,
    });

    expect(entitiesAreEqual(entity1, entity2)).toBe(false);
  });

  it("Should detect different sizes", () => {
    const entity1 = createMockSyncEntity({
      id: "same",
      entityType: "note",
      size: 100,
    });
    const entity2 = createMockSyncEntity({
      id: "same",
      entityType: "note",
      size: 200,
    });

    expect(entitiesAreEqual(entity1, entity2)).toBe(false);
  });

  it("Should detect different entity types", () => {
    const entity1 = createMockSyncEntity({ id: "same", entityType: "note" });
    const entity2 = createMockSyncEntity({
      id: "same",
      entityType: "directory",
    });

    expect(entitiesAreEqual(entity1, entity2)).toBe(false);
  });
});

describe("Ensemble - Needs Action Detection", () => {
  it("Should not need action for all undefined", () => {
    const entity = createMockMixedEntity("notes/test.json", {});
    expect(entityNeedsAction(entity)).toBe(false);
  });

  it("Should need action for local-only entity", () => {
    const entity = createScenario("local-only");
    expect(entityNeedsAction(entity)).toBe(true);
  });

  it("Should need action for remote-only entity", () => {
    const entity = createScenario("remote-only");
    expect(entityNeedsAction(entity)).toBe(true);
  });

  it("Should need action when local and remote differ", () => {
    const entity = createScenario("local-newer");
    expect(entityNeedsAction(entity)).toBe(true);
  });

  it("Should not need action for equal entities", () => {
    const entity = createScenario("both-equal");
    expect(entityNeedsAction(entity)).toBe(false);
  });

  it("Should need action for orphaned prevSync", () => {
    const entity = createScenario("both-deleted");
    expect(entityNeedsAction(entity)).toBe(true);
  });
});

describe("Ensemble - Filter Changed Entities", () => {
  it("Should filter to only changed entities", () => {
    const map = createEntityMap([
      createScenario("local-only"),
      createScenario("remote-only"),
      createScenario("both-equal"),
      createScenario("both-deleted"),
    ]);

    const filtered = filterChangedEntities(map);

    expect(filtered.size).toBe(3);
    expect(filtered.has("notes/test-local-only.json")).toBe(true);
    expect(filtered.has("notes/test-remote-only.json")).toBe(true);
    expect(filtered.has("notes/test-both-deleted.json")).toBe(true);
    expect(filtered.has("notes/test-both-equal.json")).toBe(false);
  });
});

describe("Ensemble - Local/Remote Equality with PrevSync", () => {
  it("Should handle both undefined", () => {
    expect(localEqualsPrevSync(undefined, undefined)).toBe(true);
    expect(remoteEqualsPrevSync(undefined, undefined)).toBe(true);
  });

  it("Should detect missing local entity", () => {
    const prev = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000,
    });
    expect(localEqualsPrevSync(undefined, prev)).toBe(false);
  });

  it("Should detect missing prevSync entity", () => {
    const local = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000,
    });
    expect(localEqualsPrevSync(local, undefined)).toBe(false);
  });

  it("Should detect unchanged local using localMtime", () => {
    const local = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000,
    });
    const prev = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 2000, // remoteMtime
      localMtime: 1000, // localMtime at sync time
    });

    expect(localEqualsPrevSync(local, prev)).toBe(true);
  });

  it("Should detect changed local using localMtime", () => {
    const local = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 2000,
    });
    const prev = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 2000, // remoteMtime
      localMtime: 1000, // localMtime at sync time
    });

    expect(localEqualsPrevSync(local, prev)).toBe(false);
  });

  it("Should fallback to mtime when localMtime not available", () => {
    const local = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000,
    });
    const prev = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000,
    });

    expect(localEqualsPrevSync(local, prev)).toBe(true);
  });

  it("Should detect unchanged remote using remoteMtime", () => {
    const remote = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000,
    });
    const prev = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000, // remoteMtime at sync time
      remoteMtime: 1000,
    });

    expect(remoteEqualsPrevSync(remote, prev)).toBe(true);
  });

  it("Should detect changed remote using remoteMtime", () => {
    const remote = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 2000,
    });
    const prev = createMockSyncEntity({
      id: "test",
      entityType: "note",
      mtime: 1000, // remoteMtime at sync time
      remoteMtime: 1000,
    });

    expect(remoteEqualsPrevSync(remote, prev)).toBe(false);
  });
});

describe("Ensemble - Group By Entity Type", () => {
  it("Should group notes and directories", () => {
    const map = createEntityMap([
      createMockMixedEntity("notes/note1.json", {
        local: { id: "note1", entityType: "note" },
      }),
      createMockMixedEntity("notes/note2.json", {
        local: { id: "note2", entityType: "note" },
      }),
      createMockMixedEntity("directories/dir1.json", {
        local: { id: "dir1", entityType: "directory" },
      }),
      createMockMixedEntity("images/note1/image.png", {
        local: { id: "images/note1/image.png", entityType: "image" },
      }),
    ]);

    const grouped = groupByEntityType(map);

    expect(grouped.notes).toHaveLength(2);
    expect(grouped.directories).toHaveLength(1);
    expect(grouped.images).toHaveLength(1);
  });

  it("Should determine type from remote if local missing", () => {
    const map = createEntityMap([
      createMockMixedEntity("notes/remote-note.json", {
        remote: { id: "remote-note", entityType: "note" },
      }),
    ]);

    const grouped = groupByEntityType(map);

    expect(grouped.notes).toHaveLength(1);
  });

  it("Should determine type from prevSync if both missing", () => {
    const map = createEntityMap([
      createMockMixedEntity("directories/deleted-dir.json", {
        prevSync: { id: "deleted-dir", entityType: "directory" },
      }),
    ]);

    const grouped = groupByEntityType(map);

    expect(grouped.directories).toHaveLength(1);
  });

  it("Should group managed image entities", () => {
    const map = createEntityMap([
      createMockMixedEntity("images/note-1/image.png", {
        remote: { id: "images/note-1/image.png", entityType: "image" },
      }),
    ]);

    const grouped = groupByEntityType(map);

    expect(grouped.images).toHaveLength(1);
  });
});

describe("Ensemble - Entity Statistics", () => {
  it("Should calculate correct statistics", () => {
    const map = createEntityMap([
      createMockMixedEntity("notes/local-only.json", {
        local: { id: "local-only", entityType: "note" },
      }),
      createMockMixedEntity("notes/remote-only.json", {
        remote: { id: "remote-only", entityType: "note" },
      }),
      createMockMixedEntity("notes/both.json", {
        local: { id: "both", entityType: "note" },
        remote: { id: "both", entityType: "note" },
      }),
      createMockMixedEntity("notes/orphan.json", {
        prevSync: { id: "orphan", entityType: "note" },
      }),
    ]);

    const stats = getEntityStats(map);

    expect(stats.total).toBe(4);
    expect(stats.localOnly).toBe(1);
    expect(stats.remoteOnly).toBe(1);
    expect(stats.both).toBe(1);
    expect(stats.prevSyncOnly).toBe(1);
  });
});
