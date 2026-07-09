/**
 * Tests the timeline virtualization manager scroll ordering and filter behavior.
 */
import { buildSortedNoteFilterMetadata } from "@/lib/notes/noteDerivedData";
import { TimelineManager } from "@/lib/virtualization/TimelineManager";
import type { Note } from "@/types";
import { describe, expect, it } from "vitest";

function createLocalIso(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0).toISOString();
}

function createNote(
  id: string,
  title: string,
  summary: string,
  createdAt: string,
  tagIds: string[] = [],
  updatedAt?: string,
): Note {
  return {
    id,
    title,
    summary,
    content: "",
    directoryId: null,
    tagIds,
    createdAt,
    updatedAt,
  };
}

describe("TimelineManager", () => {
  it("Should keep visible items ordered while scrolling large layouts", () => {
    const manager = new TimelineManager();
    manager.columns = 1;
    manager.setViewport(480, 240);

    manager.notes = [
      createNote("feb-4", "February 4", "", createLocalIso(2024, 1, 20)),
      createNote("feb-3", "February 3", "", createLocalIso(2024, 1, 18)),
      createNote("feb-2", "February 2", "", createLocalIso(2024, 1, 16)),
      createNote("feb-1", "February 1", "", createLocalIso(2024, 1, 14)),
      createNote("jan-4", "January 4", "", createLocalIso(2024, 0, 20)),
      createNote("jan-3", "January 3", "", createLocalIso(2024, 0, 18)),
      createNote("jan-2", "January 2", "", createLocalIso(2024, 0, 16)),
      createNote("jan-1", "January 1", "", createLocalIso(2024, 0, 14)),
    ];

    manager.scrollTop = manager.getScrollPositionForNote("jan-3");

    const visibleItems = manager.visibleItems;
    expect(visibleItems.length).toBeGreaterThan(0);
    expect(
      visibleItems.every(
        (item, index) =>
          index === 0 || visibleItems[index - 1].data.y <= item.data.y,
      ),
    ).toBe(true);

    const januaryHeaderIndex = visibleItems.findIndex(
      (item) => item.type === "header" && item.data.id === "2024-1",
    );
    const januaryNoteIndex = visibleItems.findIndex(
      (item) => item.type === "note" && item.data.id === "jan-3",
    );

    expect(januaryHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(januaryNoteIndex).toBeGreaterThan(januaryHeaderIndex);
  });

  it("Should apply search, date, and tag filters from cached note metadata", () => {
    const manager = new TimelineManager();
    manager.columns = 1;
    manager.setViewport(480, 240);

    manager.notes = [
      createNote(
        "alpha",
        "Alpha note",
        "first result",
        createLocalIso(2024, 1, 10),
        ["tag-a"],
      ),
      createNote(
        "beta",
        "Beta note",
        "different result",
        createLocalIso(2024, 0, 9),
        ["tag-b"],
      ),
      createNote(
        "gamma",
        "Gamma note",
        "contains alpha keyword",
        createLocalIso(2024, 0, 4),
        ["tag-a", "tag-b"],
        createLocalIso(2024, 2, 3),
      ),
    ];

    manager.searchQuery = "alpha";
    expect(manager.monthGroups.map((group) => group.id)).toEqual([
      "2024-2",
      "2024-1",
    ]);

    manager.searchQuery = "";
    manager.selectedTagIds = new Set(["tag-a"]);
    expect(manager.monthGroups.map((group) => group.id)).toEqual([
      "2024-2",
      "2024-1",
    ]);

    manager.sortBy = "updatedAt";
    expect(manager.monthGroups.map((group) => group.id)).toEqual([
      "2024-3",
      "2024-2",
    ]);

    manager.selectedDate = new Date(2024, 2, 3, 12, 0, 0, 0);
    expect(manager.monthGroups.map((group) => group.id)).toEqual(["2024-3"]);
    expect(manager.visibleItems.some((item) => item.type === "note")).toBe(
      true,
    );
  });

  it("Should require every selected tag when tag filter mode matches all", () => {
    const manager = new TimelineManager();
    manager.columns = 1;
    manager.setViewport(480, 240);

    manager.notes = [
      createNote("alpha", "Alpha", "", createLocalIso(2024, 1, 10), ["tag-a"]),
      createNote("beta", "Beta", "", createLocalIso(2024, 1, 9), ["tag-b"]),
      createNote("both", "Both", "", createLocalIso(2024, 1, 8), [
        "tag-a",
        "tag-b",
      ]),
    ];

    manager.selectedTagIds = new Set(["tag-a", "tag-b"]);
    manager.tagFilterMode = "or";
    expect(
      manager.visibleItems
        .filter((item) => item.type === "note")
        .map((item) => item.data.id),
    ).toEqual(["alpha", "beta", "both"]);

    manager.tagFilterMode = "and";
    expect(
      manager.visibleItems
        .filter((item) => item.type === "note")
        .map((item) => item.data.id),
    ).toEqual(["both"]);
  });

  it("Should apply externally supplied sorted note metadata", () => {
    const manager = new TimelineManager();
    manager.columns = 1;
    manager.setViewport(480, 240);

    const timelineData = buildSortedNoteFilterMetadata(
      [
        createNote(
          "created-newer",
          "Created newer",
          "contains alpha",
          createLocalIso(2024, 1, 10),
          ["tag-a"],
          createLocalIso(2024, 1, 11),
        ),
        createNote(
          "updated-newer",
          "Updated newer",
          "contains alpha",
          createLocalIso(2024, 0, 10),
          ["tag-a"],
          createLocalIso(2024, 2, 11),
        ),
      ],
      "updatedAt",
    );

    manager.setTimelineData(
      timelineData.notes,
      timelineData.metadata,
      "updatedAt",
    );
    manager.searchQuery = "alpha";
    manager.selectedTagIds = new Set(["tag-a"]);

    expect(manager.monthGroups.map((group) => group.id)).toEqual([
      "2024-3",
      "2024-2",
    ]);
    expect(manager.visibleItems.some((item) => item.type === "note")).toBe(
      true,
    );
  });

  it("Should keep the month header visible when only note rows intersect the viewport", () => {
    const manager = new TimelineManager();
    manager.columns = 1;
    manager.setViewport(480, 240);

    manager.notes = [
      createNote("jan-6", "January 6", "", createLocalIso(2024, 0, 26)),
      createNote("jan-5", "January 5", "", createLocalIso(2024, 0, 24)),
      createNote("jan-4", "January 4", "", createLocalIso(2024, 0, 22)),
      createNote("jan-3", "January 3", "", createLocalIso(2024, 0, 20)),
      createNote("jan-2", "January 2", "", createLocalIso(2024, 0, 18)),
      createNote("jan-1", "January 1", "", createLocalIso(2024, 0, 16)),
    ];

    manager.scrollTop = manager.getScrollPositionForNote("jan-2");

    expect(
      manager.visibleItems.some(
        (item) => item.type === "header" && item.data.id === "2024-1",
      ),
    ).toBe(true);
    expect(
      manager.visibleItems.some(
        (item) => item.type === "note" && item.data.id === "jan-2",
      ),
    ).toBe(true);
  });
});
