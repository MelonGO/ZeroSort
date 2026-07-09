/**
 * Tests for the export asset helpers - per-note asset naming and collision handling.
 */
import { describe, expect, it } from "vitest";

import {
  createUniqueExportStem,
  prepareManagedImageExportPlan,
  sanitizeExportPathSegment,
} from "@/lib/exportAssets";

describe("Export asset helpers - note and file naming", () => {
  it("Should sanitize invalid filesystem characters in note titles", () => {
    expect(sanitizeExportPathSegment('Bad:/\\*?"<>| Note')).toBe("Bad_ Note");
  });

  it("Should fall back to Untitled when note title becomes empty", () => {
    expect(sanitizeExportPathSegment("   ")).toBe("Untitled");
  });

  it("Should build per-note asset paths for managed images", () => {
    const plan = prepareManagedImageExportPlan("Trip Notes", [
      "images/note-1/photo.png",
      "images/note-1/diagram.jpg",
    ]);

    expect(plan.exportStem).toBe("Trip Notes");
    expect(plan.assetDirectoryName).toBe("Trip Notes.assets");
    expect(plan.assets).toEqual([
      {
        sourcePath: "images/note-1/photo.png",
        fileName: "photo.png",
        markdownPath: "./Trip Notes.assets/photo.png",
      },
      {
        sourcePath: "images/note-1/diagram.jpg",
        fileName: "diagram.jpg",
        markdownPath: "./Trip Notes.assets/diagram.jpg",
      },
    ]);
  });

  it("Should resolve duplicate basenames deterministically", () => {
    const plan = prepareManagedImageExportPlan("Trip Notes", [
      "images/note-1/photo.png",
      "images/note-2/photo.png",
      "images/note-3/photo.png",
    ]);

    expect(plan.assets.map((asset) => asset.fileName)).toEqual([
      "photo.png",
      "photo-2.png",
      "photo-3.png",
    ]);
  });

  it("Should resolve duplicate export stems deterministically", () => {
    const usedStems = new Set<string>(["Trip Notes", "Trip Notes-2"]);

    expect(createUniqueExportStem("Trip Notes", usedStems)).toBe(
      "Trip Notes-3",
    );
  });
});
