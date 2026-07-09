/**
 * Tests for the image storage helpers - Managed image path normalization and detection.
 */
import { describe, expect, it } from "vitest";

import {
  extractManagedImagePathsFromContent,
  extractManagedImagePathsFromRecords,
  getManagedImageNoteId,
  getManagedImagePathsMissingFromContent,
  getRemovedManagedImagePaths,
  isLegacyBase64ImageSrc,
  isManagedImagePath,
  normalizeManagedImagePath,
} from "@/lib/images";

describe("Image storage helpers - managed path handling", () => {
  it("Should normalize managed image paths to forward-slash relative paths", () => {
    expect(normalizeManagedImagePath("/images\\note-1\\image.png")).toBe(
      "images/note-1/image.png",
    );
  });

  it("Should detect managed image paths", () => {
    expect(isManagedImagePath("images/note-1/image.png")).toBe(true);
    expect(isManagedImagePath("https://example.com/image.png")).toBe(false);
  });

  it("Should detect legacy base64 image sources", () => {
    expect(isLegacyBase64ImageSrc("data:image/png;base64,abc123")).toBe(true);
    expect(isLegacyBase64ImageSrc("images/note-1/image.png")).toBe(false);
  });

  it("Should fall back to the unassigned bucket for missing note ids", () => {
    expect(getManagedImageNoteId()).toBe("unassigned");
    expect(getManagedImageNoteId("note-123")).toBe("note-123");
  });

  it("Should extract managed image paths from Tiptap JSON content", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "image",
              attrs: { src: "images/note-1/a.png" },
            },
            {
              type: "image",
              attrs: { src: "https://example.com/image.png" },
            },
          ],
        },
        {
          type: "image",
          attrs: { src: "images/note-1/a.png" },
        },
        {
          type: "image",
          attrs: { src: "images/note-2/b.png" },
        },
      ],
    });

    expect(extractManagedImagePathsFromContent(content)).toEqual([
      "images/note-1/a.png",
      "images/note-2/b.png",
    ]);
  });

  it("Should aggregate managed image paths across multiple records", () => {
    const records = [
      {
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
        }),
      },
      {
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "image", attrs: { src: "images/note-2/b.png" } }],
        }),
      },
      {
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
        }),
      },
    ];

    expect(extractManagedImagePathsFromRecords(records)).toEqual([
      "images/note-1/a.png",
      "images/note-2/b.png",
    ]);
  });

  it("Should return only managed image paths removed from content", () => {
    const previousContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "images/note-1/a.png" },
        },
        {
          type: "image",
          attrs: { src: "images/note-1/b.png" },
        },
        {
          type: "image",
          attrs: { src: "images/note-1/a.png" },
        },
      ],
    });
    const nextContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "images/note-1/b.png" },
        },
        {
          type: "image",
          attrs: { src: "https://example.com/image.png" },
        },
      ],
    });

    expect(getRemovedManagedImagePaths(previousContent, nextContent)).toEqual([
      "images/note-1/a.png",
    ]);
  });

  it("Should return no removed managed image paths when content is unchanged", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
    });

    expect(getRemovedManagedImagePaths(content, content)).toEqual([]);
  });

  it("Should ignore invalid JSON content when diffing removed managed image paths", () => {
    const nextContent = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
    });

    expect(getRemovedManagedImagePaths("{", nextContent)).toEqual([]);
    expect(getRemovedManagedImagePaths(nextContent, "{")).toEqual([
      "images/note-1/a.png",
    ]);
  });

  it("Should return candidate managed image paths missing from content", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "images/note-1/a.png" } },
        { type: "image", attrs: { src: "images/note-1/b.png" } },
      ],
    });

    expect(
      getManagedImagePathsMissingFromContent(content, [
        "images/note-1/a.png",
        "images/note-1/c.png",
        "https://example.com/image.png",
        "/images/note-1/c.png",
      ]),
    ).toEqual(["images/note-1/c.png"]);
  });
});

describe("Image extraction cache - noteId-based caching", () => {
  it("Should return cached result for the same noteId and same content", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
    });

    const first = extractManagedImagePathsFromContent(content, "cache-test-1");
    const second = extractManagedImagePathsFromContent(content, "cache-test-1");

    expect(first).toEqual(["images/note-1/a.png"]);
    expect(second).toEqual(["images/note-1/a.png"]);
    // Same reference means it came from cache
    expect(first).toBe(second);
  });

  it("Should invalidate cache when content changes for the same noteId", () => {
    const contentA = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
    });
    const contentB = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/b.png" } }],
    });

    const first = extractManagedImagePathsFromContent(contentA, "cache-test-2");
    const second = extractManagedImagePathsFromContent(
      contentB,
      "cache-test-2",
    );

    expect(first).toEqual(["images/note-1/a.png"]);
    expect(second).toEqual(["images/note-1/b.png"]);
    // Different references since content changed
    expect(first).not.toBe(second);
  });

  it("Should work without noteId (uncached path)", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
    });

    const first = extractManagedImagePathsFromContent(content);
    const second = extractManagedImagePathsFromContent(content);

    expect(first).toEqual(["images/note-1/a.png"]);
    expect(second).toEqual(["images/note-1/a.png"]);
    // Without noteId, cache is not used so references differ
    expect(first).not.toBe(second);
  });

  it("Should pass noteId through aggregation helpers", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "images/note-1/a.png" } },
        { type: "image", attrs: { src: "images/note-1/b.png" } },
      ],
    });

    expect(
      getManagedImagePathsMissingFromContent(
        content,
        ["images/note-1/a.png", "images/note-1/c.png"],
        "cache-test-3",
      ),
    ).toEqual(["images/note-1/c.png"]);

    const prevContent = JSON.stringify({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "images/note-1/a.png" } },
        { type: "image", attrs: { src: "images/note-1/b.png" } },
      ],
    });
    const nextContent = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "images/note-1/b.png" } }],
    });

    expect(
      getRemovedManagedImagePaths(prevContent, nextContent, "cache-test-4"),
    ).toEqual(["images/note-1/a.png"]);
  });

  it("Should use record id for cache in extractManagedImagePathsFromRecords", () => {
    const records = [
      {
        id: "rec-1",
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "image", attrs: { src: "images/note-1/a.png" } }],
        }),
      },
      {
        id: "rec-2",
        content: JSON.stringify({
          type: "doc",
          content: [{ type: "image", attrs: { src: "images/note-2/b.png" } }],
        }),
      },
    ];

    expect(extractManagedImagePathsFromRecords(records)).toEqual([
      "images/note-1/a.png",
      "images/note-2/b.png",
    ]);
  });
});
