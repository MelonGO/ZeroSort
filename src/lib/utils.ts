import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Concatenates and merges Tailwind CSS classes using clsx and tailwind-merge.
 *
 * @param inputs - A variable number of class values (strings, arrays, or objects).
 * @returns A single string of merged Tailwind CSS classes.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Recursively deep-merges two plain objects. Arrays are not merged — the override value wins.
 *
 * @param base - The base object to merge into.
 * @param override - The object whose values take precedence.
 * @returns A new object with deeply merged properties.
 */
export function mergeDeep(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    if (
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key]) &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key])
    ) {
      result[key] = mergeDeep(
        result[key] as Record<string, unknown>,
        override[key] as Record<string, unknown>,
      );
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Recursively extracts plain text from a TipTap JSON document.
 *
 * @param json - The TipTap JSON content (parsed or as string).
 * @param blockSeparator - Separator between block-level elements (default: '\n').
 * @returns Plain text extracted from the document.
 */
export function extractTextFromTiptapJson(
  json: string | object,
  blockSeparator: string = "\n",
): string {
  try {
    const doc = typeof json === "string" ? JSON.parse(json) : json;

    if (!doc || typeof doc !== "object") {
      return "";
    }

    // If this is a text node, return its text content
    if (doc.type === "text" && typeof doc.text === "string") {
      return doc.text;
    }

    // If there's no content array, return empty
    if (!Array.isArray(doc.content)) {
      return "";
    }

    // Block-level nodes that should have separators between them
    const blockNodes = new Set([
      "paragraph",
      "heading",
      "codeBlock",
      "blockquote",
      "listItem",
      "taskItem",
    ]);

    // Recursively extract text from all child nodes
    const texts: string[] = [];
    for (const node of doc.content) {
      const text = extractTextFromTiptapJson(node, blockSeparator);
      if (text) {
        texts.push(text);
      }
    }

    // Join with separator if this is the doc or a block-level container
    if (doc.type === "doc" || blockNodes.has(doc.type)) {
      return texts.join(blockSeparator);
    }

    // For inline content, join without separator
    return texts.join("");
  } catch {
    // If parsing fails, return the original content if it's a string
    return typeof json === "string" ? json : "";
  }
}
