/**
 * Tests for tag name resolution helpers used by AI regeneration flows.
 */
import { resolveTagIdsFromNames } from "@/lib/tagNames";
import { describe, expect, it, vi } from "vitest";

describe("resolveTagIdsFromNames", () => {
  it("Should reuse existing tags case-insensitively and create missing tags", async () => {
    const addTag = vi.fn().mockResolvedValue({
      id: "tag-new",
      name: "Ideas",
      color: null,
      createdAt: "2026-03-23T00:00:00.000Z",
      updatedAt: "2026-03-23T00:00:00.000Z",
    });

    const result = await resolveTagIdsFromNames({
      tagNames: ["Work", " ideas ", "WORK", ""],
      tags: [
        {
          id: "tag-work",
          name: "work",
          color: null,
          createdAt: "2026-03-23T00:00:00.000Z",
          updatedAt: "2026-03-23T00:00:00.000Z",
        },
      ],
      addTag,
    });

    expect(result).toEqual(["tag-work", "tag-new"]);
    expect(addTag).toHaveBeenCalledTimes(1);
    expect(addTag).toHaveBeenCalledWith("ideas");
  });
});
