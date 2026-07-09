/**
 * Tests for sync profile active-profile lifecycle helpers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Sync Profiles - Active Profile Creation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("Should only create one active profile for concurrent callers", async () => {
    const profiles: Array<Record<string, unknown>> = [];
    const db = {
      select: vi.fn(async (query: string, params?: unknown[]) => {
        if (query.includes("SELECT id FROM sync_profiles WHERE isActive = 1")) {
          return profiles
            .filter((profile) => profile.isActive === 1)
            .map((profile) => ({ id: profile.id }));
        }

        if (
          query.includes("SELECT * FROM sync_profiles WHERE id = $1 LIMIT 1")
        ) {
          return profiles.filter((profile) => profile.id === params?.[0]);
        }

        return [];
      }),
      execute: vi.fn(async (query: string, params?: unknown[]) => {
        if (
          query.includes(
            "UPDATE sync_profiles SET isActive = 0 WHERE isActive = 1",
          )
        ) {
          for (const profile of profiles) {
            profile.isActive = 0;
          }
          return;
        }

        if (query.includes("INSERT INTO sync_profiles")) {
          const [
            id,
            label,
            serviceType,
            region,
            endpointUrl,
            bucketName,
            prefix,
            createdAt,
            lastSyncAt,
            isActive,
          ] = params as unknown[];

          await new Promise((resolve) => setTimeout(resolve, 10));

          profiles.push({
            id,
            label,
            serviceType,
            region,
            endpointUrl,
            bucketName,
            prefix,
            createdAt,
            lastSyncAt,
            isActive,
          });
        }
      }),
    };

    vi.doMock("../index", () => ({ db }));

    const { getOrCreateActiveSyncProfile } = await import("../syncProfiles");

    const profileInput = {
      label: "bucket-a",
      serviceType: "s3" as const,
      region: "us-east-1",
      endpointUrl: "https://s3.us-east-1.amazonaws.com",
      bucketName: "bucket-a",
      prefix: "zerosort/",
      isActive: true,
    };

    const [first, second] = await Promise.all([
      getOrCreateActiveSyncProfile(profileInput),
      getOrCreateActiveSyncProfile(profileInput),
    ]);

    expect(first.id).toBe(second.id);
    expect(
      db.execute.mock.calls.filter(([query]) =>
        (query as string).includes("INSERT INTO sync_profiles"),
      ),
    ).toHaveLength(1);
    expect(profiles).toHaveLength(1);
  });
});
