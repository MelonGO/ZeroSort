const EMPTY_DOCUMENT = { type: "doc", content: [] };
// Safety net; the unload lifecycle (clearParsedEditorContent) is the primary bounding mechanism.
const PARSED_CONTENT_CACHE_LIMIT = 20;
const parsedContentCache = new Map<string, { raw: string; parsed: unknown }>();

/** Returns cached parsed editor content for a note or parses it on demand. */
export function getParsedEditorContent(
  noteId: string | undefined,
  content: string,
) {
  if (!content) {
    return EMPTY_DOCUMENT;
  }

  if (!noteId) {
    try {
      return JSON.parse(content);
    } catch {
      return EMPTY_DOCUMENT;
    }
  }

  const cachedEntry = parsedContentCache.get(noteId);
  if (cachedEntry?.raw === content) {
    parsedContentCache.delete(noteId);
    parsedContentCache.set(noteId, cachedEntry);
    return cachedEntry.parsed;
  }

  try {
    const parsed = JSON.parse(content);
    parsedContentCache.set(noteId, { raw: content, parsed });
    if (parsedContentCache.size > PARSED_CONTENT_CACHE_LIMIT) {
      const oldestKey = parsedContentCache.keys().next().value;
      if (oldestKey) {
        parsedContentCache.delete(oldestKey);
      }
    }
    return parsed;
  } catch {
    parsedContentCache.delete(noteId);
    return EMPTY_DOCUMENT;
  }
}

/** Removes parsed editor content cached for a specific note. */
export function clearParsedEditorContent(noteId: string) {
  parsedContentCache.delete(noteId);
}

/** Removes cached parsed content entries for notes that no longer exist. */
export function pruneParsedEditorContent(validNoteIds: Iterable<string>) {
  const validIds = new Set(validNoteIds);

  for (const noteId of parsedContentCache.keys()) {
    if (!validIds.has(noteId)) {
      parsedContentCache.delete(noteId);
    }
  }
}
