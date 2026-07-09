import { BacklinkGroup, Note, NoteLink, WikiLink } from "@/types";
import { db } from "./index";

interface TiptapJsonNode {
  type?: string;
  text?: string;
  attrs?: {
    noteTitle?: string;
    displayText?: string;
  };
  content?: TiptapJsonNode[];
}

const wikiLinkRegex = /\[\[([^\[\]|]+)(?:\|([^\]]+))?\]\]/g;
const SQL_IN_CHUNK_SIZE = 500;

async function createNoteLinksTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS note_links (
      id TEXT PRIMARY KEY,
      sourceNoteId TEXT NOT NULL,
      targetNoteId TEXT,
      linkText TEXT NOT NULL,
      targetTitle TEXT NOT NULL,
      position INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      FOREIGN KEY (sourceNoteId) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (targetNoteId) REFERENCES notes(id) ON DELETE SET NULL
    );
  `);
}

async function createNoteLinksIndexes() {
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_note_links_source
    ON note_links(sourceNoteId);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_note_links_target
    ON note_links(targetNoteId);
  `);
}

async function hasCurrentNoteLinksSchema(): Promise<boolean> {
  const rows = await db.select<Array<{ name: string }>>(
    "PRAGMA table_info(note_links)",
  );

  if (rows.length === 0) {
    return false;
  }

  const columns = new Set(rows.map((row) => row.name));

  return [
    "id",
    "sourceNoteId",
    "targetNoteId",
    "linkText",
    "targetTitle",
    "position",
    "createdAt",
    "updatedAt",
  ].every((column) => columns.has(column));
}

function extractWikiLinksFromText(content: string, offset = 0): WikiLink[] {
  const links: WikiLink[] = [];
  let match: RegExpExecArray | null;

  wikiLinkRegex.lastIndex = 0;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const linkText = match[1].trim();
    const displayText = match[2]?.trim();

    links.push({
      linkText,
      displayText,
      targetNoteId: null,
      position: offset + match.index,
    });
  }

  return links;
}

function walkTiptapNode(
  node: TiptapJsonNode,
  offset: number,
  links: WikiLink[],
) {
  if (node.type === "text") {
    const text = node.text || "";
    links.push(...extractWikiLinksFromText(text, offset));
    return offset + text.length;
  }

  if (node.type === "wikiLink") {
    const noteTitle = node.attrs?.noteTitle?.trim() || "";
    const displayText = node.attrs?.displayText?.trim() || undefined;
    const renderedText = displayText
      ? `[[${noteTitle}|${displayText}]]`
      : `[[${noteTitle}]]`;

    if (noteTitle) {
      links.push({
        linkText: noteTitle,
        displayText,
        targetNoteId: null,
        position: offset,
      });
    }

    return offset + renderedText.length;
  }

  let nextOffset = offset;
  for (const child of node.content || []) {
    nextOffset = walkTiptapNode(child, nextOffset, links);
  }

  if (
    node.type === "paragraph" ||
    node.type === "heading" ||
    node.type === "blockquote" ||
    node.type === "listItem" ||
    node.type === "bulletList" ||
    node.type === "orderedList" ||
    node.type === "codeBlock"
  ) {
    nextOffset += 1;
  }

  return nextOffset;
}

function extractWikiLinksFromTiptapJson(content: string): WikiLink[] {
  try {
    const parsed = JSON.parse(content) as TiptapJsonNode;
    if (!parsed || typeof parsed !== "object") {
      return [];
    }

    const links: WikiLink[] = [];
    walkTiptapNode(parsed, 0, links);
    return links;
  } catch {
    return [];
  }
}

function buildNoteLinkId(sourceNoteId: string, link: WikiLink): string {
  return `${sourceNoteId}_${link.targetNoteId ?? "broken"}_${link.position}`;
}

/** Normalizes a note title for case-insensitive matching. */
function normalizeNoteTitle(title: string): string {
  return title.toLowerCase().trim();
}

/** Creates positional SQL placeholders for IN clauses. */
function createPlaceholders(count: number): string {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(
    ", ",
  );
}

/** Converts a metadata-only note row into a Note object. */
function rowToMetadataNote(row: any): Note {
  return {
    ...row,
    content: "",
    isContentLoaded: false,
    directoryId: row.directoryId || null,
    tagIds: [],
  };
}

/** Finds the newest matching note for each normalized title. */
async function findNotesByNormalizedTitles(
  normalizedTitles: Iterable<string>,
): Promise<Map<string, Note>> {
  const titleList = Array.from(new Set(normalizedTitles)).filter(Boolean);
  const notesByTitle = new Map<string, Note>();

  for (let i = 0; i < titleList.length; i += SQL_IN_CHUNK_SIZE) {
    const chunk = titleList.slice(i, i + SQL_IN_CHUNK_SIZE);
    const placeholders = createPlaceholders(chunk.length);
    const rows = await db.select<any[]>(
      `SELECT
        id,
        title,
        summary,
        directoryId,
        createdAt,
        updatedAt,
        LOWER(TRIM(title)) as normalizedTitle
       FROM notes
       WHERE LOWER(TRIM(title)) IN (${placeholders})
       ORDER BY normalizedTitle ASC, COALESCE(updatedAt, createdAt) DESC`,
      chunk,
    );

    for (const row of rows) {
      if (!notesByTitle.has(row.normalizedTitle)) {
        notesByTitle.set(row.normalizedTitle, rowToMetadataNote(row));
      }
    }
  }

  return notesByTitle;
}

/** Loads note titles by ID in chunks for batched link persistence. */
async function getNoteTitlesById(noteIds: Iterable<string>) {
  const idList = Array.from(new Set(noteIds)).filter(Boolean);
  const titlesById = new Map<string, string>();

  for (let i = 0; i < idList.length; i += SQL_IN_CHUNK_SIZE) {
    const chunk = idList.slice(i, i + SQL_IN_CHUNK_SIZE);
    const placeholders = createPlaceholders(chunk.length);
    const rows = await db.select<Array<{ id: string; title: string }>>(
      `SELECT id, title FROM notes WHERE id IN (${placeholders})`,
      chunk,
    );

    for (const row of rows) {
      titlesById.set(row.id, row.title);
    }
  }

  return titlesById;
}

async function rebuildNoteLinksFromNotes() {
  const { getAllNotesWithContent } = await import("./notes");
  const notes = await getAllNotesWithContent();

  for (const note of notes) {
    await rebuildLinksForNote(note.id, note.content || "");
  }
}

/**
 * Rebuilds link rows for a single note from its current content.
 * Extracts wiki links, resolves them against existing notes, and
 * replaces the persisted link set for the source note.
 */
export async function rebuildLinksForNote(
  noteId: string,
  content: string,
): Promise<void> {
  const wikiLinks = extractWikiLinks(content);
  const resolvedLinks = await resolveWikiLinks(wikiLinks);
  await syncNoteLinks(noteId, resolvedLinks);
}

/**
 * Initializes the 'note_links' table in the database.
 * Tracks bidirectional link relationships between notes.
 */
export async function initNoteLinksDb() {
  const hasCurrentSchema = await hasCurrentNoteLinksSchema();

  if (!hasCurrentSchema) {
    await db.execute("DROP TABLE IF EXISTS note_links");
    await createNoteLinksTable();
    await createNoteLinksIndexes();
    await rebuildNoteLinksFromNotes();
    return;
  }

  await createNoteLinksTable();
  await createNoteLinksIndexes();
}

/**
 * Extracts all [[...]] wiki-style links from note content.
 * Supports both [[Note Title]] and [[Note Title|Display Text]] formats.
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const tiptapLinks = extractWikiLinksFromTiptapJson(content);
  if (tiptapLinks.length > 0) {
    return tiptapLinks;
  }

  return extractWikiLinksFromText(content);
}

/**
 * Finds a note by title (case-insensitive).
 * Returns the most recently updated note if multiple matches exist.
 */
export async function findNoteByTitle(title: string): Promise<Note | null> {
  return (
    (await findNotesByNormalizedTitles([normalizeNoteTitle(title)])).get(
      normalizeNoteTitle(title),
    ) ?? null
  );
}

/**
 * Resolves wiki links by finding matching notes and populating targetNoteId.
 */
export async function resolveWikiLinks(links: WikiLink[]): Promise<WikiLink[]> {
  const notesByTitle = await findNotesByNormalizedTitles(
    links.map((link) => normalizeNoteTitle(link.linkText)),
  );

  return links.map((link) => ({
    ...link,
    targetNoteId:
      notesByTitle.get(normalizeNoteTitle(link.linkText))?.id || null,
  }));
}

/**
 * Saves all links for a note, replacing any existing links.
 * This is called after a note is saved/updated.
 */
export async function syncNoteLinks(
  sourceNoteId: string,
  links: WikiLink[],
): Promise<void> {
  // Delete existing links for this note
  await db.execute("DELETE FROM note_links WHERE sourceNoteId = $1", [
    sourceNoteId,
  ]);

  if (links.length === 0) {
    return;
  }

  // Insert new links
  const createdAt = new Date().toISOString();
  const values: any[] = [];
  const placeholders: string[] = [];
  const targetTitlesById = await getNoteTitlesById(
    links
      .map((link) => link.targetNoteId)
      .filter((id): id is string => typeof id === "string"),
  );

  let paramIndex = 1;
  for (const link of links) {
    placeholders.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`,
    );

    const targetTitle = link.targetNoteId
      ? (targetTitlesById.get(link.targetNoteId) ?? link.linkText)
      : link.linkText;

    values.push(
      buildNoteLinkId(sourceNoteId, link),
      sourceNoteId,
      link.targetNoteId,
      link.linkText,
      targetTitle,
      link.position,
      createdAt,
    );
    paramIndex += 7;
  }

  if (placeholders.length > 0) {
    const sql = `
      INSERT INTO note_links (id, sourceNoteId, targetNoteId, linkText, targetTitle, position, createdAt)
      VALUES ${placeholders.join(", ")}
    `;
    await db.execute(sql, values);
  }
}

/**
 * Gets all outgoing links from a note.
 */
export async function getOutgoingLinks(noteId: string): Promise<NoteLink[]> {
  const rows = await db.select<any[]>(
    `SELECT
      nl.sourceNoteId,
      nl.targetNoteId,
      nl.linkText,
      nl.targetTitle,
      nl.position,
      nl.createdAt,
      nl.updatedAt,
      n.title as currentTitle,
      n.summary
    FROM note_links nl
    LEFT JOIN notes n ON nl.targetNoteId = n.id
    WHERE nl.sourceNoteId = $1
    ORDER BY nl.position ASC`,
    [noteId],
  );

  return rows.map((row) => ({
    sourceNoteId: row.sourceNoteId,
    targetNoteId: row.targetNoteId,
    linkText: row.linkText,
    targetTitle: row.targetTitle,
    targetSummary: row.summary,
    position: row.position,
    isBroken: !row.currentTitle, // Broken if target note doesn't exist
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Gets all backlinks to a note (incoming links from other notes).
 */
export async function getBacklinks(noteId: string): Promise<NoteLink[]> {
  const rows = await db.select<any[]>(
    `SELECT
      nl.sourceNoteId,
      nl.targetNoteId,
      nl.linkText,
      nl.targetTitle,
      nl.position,
      nl.createdAt,
      nl.updatedAt,
      n.title as sourceTitle,
      n.summary as sourceSummary,
      target.summary as targetSummary
    FROM note_links nl
    INNER JOIN notes n ON nl.sourceNoteId = n.id
    LEFT JOIN notes target ON nl.targetNoteId = target.id
    WHERE nl.targetNoteId = $1
    ORDER BY nl.createdAt DESC`,
    [noteId],
  );

  return rows.map((row) => ({
    sourceNoteId: row.sourceNoteId,
    targetNoteId: row.targetNoteId,
    linkText: row.linkText,
    targetTitle: row.targetTitle,
    targetSummary: row.targetSummary,
    position: row.position,
    isBroken: false, // Backlinks are never broken (source note exists)
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Groups backlinks by source note.
 */
export async function getBacklinkGroups(
  noteId: string,
): Promise<BacklinkGroup[]> {
  const backlinks = await db.select<any[]>(
    `SELECT
      nl.sourceNoteId,
      nl.targetNoteId,
      nl.linkText,
      nl.targetTitle,
      nl.position,
      nl.createdAt,
      nl.updatedAt,
      n.id as sourceId,
      n.title as sourceTitle,
      n.summary as sourceSummary,
      n.directoryId as sourceDirectoryId,
      n.createdAt as sourceCreatedAt,
      n.updatedAt as sourceUpdatedAt,
      target.summary as targetSummary
    FROM note_links nl
    INNER JOIN notes n ON nl.sourceNoteId = n.id
    LEFT JOIN notes target ON nl.targetNoteId = target.id
    WHERE nl.targetNoteId = $1
    ORDER BY nl.createdAt DESC`,
    [noteId],
  );
  const groups = new Map<string, BacklinkGroup>();

  for (const row of backlinks) {
    if (!groups.has(row.sourceNoteId)) {
      groups.set(row.sourceNoteId, {
        sourceNote: {
          id: row.sourceId,
          title: row.sourceTitle,
          summary: row.sourceSummary,
          content: "",
          directoryId: row.sourceDirectoryId || null,
          tagIds: [],
          createdAt: row.sourceCreatedAt,
          updatedAt: row.sourceUpdatedAt,
          isContentLoaded: false,
        },
        links: [],
      });
    }

    groups.get(row.sourceNoteId)?.links.push({
      sourceNoteId: row.sourceNoteId,
      targetNoteId: row.targetNoteId,
      linkText: row.linkText,
      targetTitle: row.targetTitle,
      targetSummary: row.targetSummary,
      position: row.position,
      isBroken: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  return Array.from(groups.values());
}

/**
 * Updates all links when a note title changes.
 */
export async function updateLinksForRenamedNote(
  noteId: string,
  newTitle: string,
): Promise<void> {
  const updatedAt = new Date().toISOString();

  await db.execute(
    `UPDATE note_links
     SET targetTitle = $1, updatedAt = $2
     WHERE targetNoteId = $3`,
    [newTitle, updatedAt, noteId],
  );
}

/**
 * Deletes all links for a note (both outgoing and incoming).
 */
export async function deleteNoteLinks(noteId: string): Promise<void> {
  await db.execute("DELETE FROM note_links WHERE sourceNoteId = $1", [noteId]);
}

/**
 * Gets count of outgoing links for a note.
 */
export async function getOutgoingLinkCount(noteId: string): Promise<number> {
  const rows = await db.select<any[]>(
    "SELECT COUNT(*) as count FROM note_links WHERE sourceNoteId = $1",
    [noteId],
  );
  return rows[0]?.count || 0;
}

/**
 * Gets count of backlinks for a note.
 */
export async function getBacklinkCount(noteId: string): Promise<number> {
  const rows = await db.select<any[]>(
    "SELECT COUNT(*) as count FROM note_links WHERE targetNoteId = $1",
    [noteId],
  );
  return rows[0]?.count || 0;
}

/**
 * Gets all note links from the database.
 * Used for sync operations.
 */
export async function getAllNoteLinks(): Promise<NoteLink[]> {
  const rows = await db.select<any[]>(
    `SELECT
      sourceNoteId,
      targetNoteId,
      linkText,
      targetTitle,
      position,
      createdAt,
      updatedAt
    FROM note_links
    ORDER BY createdAt ASC`,
  );

  return rows.map((row) => ({
    sourceNoteId: row.sourceNoteId,
    targetNoteId: row.targetNoteId,
    linkText: row.linkText,
    targetTitle: row.targetTitle,
    targetSummary: undefined,
    position: row.position,
    isBroken: row.targetNoteId == null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
