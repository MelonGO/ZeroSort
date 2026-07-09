import { normalizeManagedImagePath } from "@/lib/images";

export interface ManagedImageExportTarget {
  sourcePath: string;
  fileName: string;
  markdownPath: string;
}

export interface ManagedImageExportPlan {
  exportStem: string;
  assetDirectoryName: string;
  assets: ManagedImageExportTarget[];
}

/** Returns a filesystem-safe export segment for note and asset names. */
export function sanitizeExportPathSegment(value: string): string {
  const sanitizedValue = value.replace(/[<>:"/\\|?*]+/g, "_").trim();
  return sanitizedValue || "Untitled";
}

/** Returns a unique export stem by appending numeric suffixes when needed. */
export function createUniqueExportStem(
  baseStem: string,
  usedStems: Set<string>,
): string {
  let candidate = baseStem;
  let suffix = 2;

  while (usedStems.has(candidate)) {
    candidate = `${baseStem}-${suffix}`;
    suffix++;
  }

  return candidate;
}

/** Builds deterministic per-note asset targets for managed image export. */
export function prepareManagedImageExportPlan(
  exportStem: string,
  imagePaths: string[],
): ManagedImageExportPlan {
  const assetDirectoryName = `${exportStem}.assets`;
  const usedFileNames = new Set<string>();

  const assets = imagePaths.map((imagePath, index) => {
    const normalizedPath = normalizeManagedImagePath(imagePath);
    const originalFileName =
      normalizedPath.split("/").pop() || `image-${index + 1}`;
    const fileName = createUniqueExportFileName(
      originalFileName,
      usedFileNames,
    );
    usedFileNames.add(fileName);

    return {
      sourcePath: normalizedPath,
      fileName,
      markdownPath: `./${assetDirectoryName}/${fileName}`,
    };
  });

  return {
    exportStem,
    assetDirectoryName,
    assets,
  };
}

function createUniqueExportFileName(
  originalFileName: string,
  usedFileNames: Set<string>,
): string {
  const dotIndex = originalFileName.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const baseName = hasExtension
    ? originalFileName.slice(0, dotIndex)
    : originalFileName;
  const extension = hasExtension ? originalFileName.slice(dotIndex) : "";

  let candidate = originalFileName;
  let suffix = 2;

  while (usedFileNames.has(candidate)) {
    candidate = `${baseName}-${suffix}${extension}`;
    suffix++;
  }

  return candidate;
}
