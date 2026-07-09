import type { Note, SortBy } from "@/types";

/**
 * Lightweight date parts used by note filtering and grouping.
 */
export interface NoteDateMetadata {
  /** Day key in local time. */
  dateKey: string;
  /** Calendar day of month in local time. */
  day: number;
  /** Calendar month in local time (1-12). */
  month: number;
  /** Month key in local time. */
  monthId: string;
  /** Calendar year in local time. */
  year: number;
}

/**
 * Cached per-note metadata used by timeline filtering and derived filter counts.
 */
export interface NoteFilterMetadata {
  /** Unique note identifier. */
  id: string;
  /** Local-time created date parts. */
  createdAt: NoteDateMetadata;
  /** Lower-cased search text for title and summary. */
  searchText: string;
  /** Cached tag IDs for fast membership checks. */
  tagIdSet: ReadonlySet<string>;
  /** Local-time updated date parts (falls back to createdAt). */
  updatedAt: NoteDateMetadata;
}

/** Sorted notes with filter metadata aligned to the sorted note order. */
export interface SortedNoteFilterMetadata {
  /** Notes sorted by the selected timeline field. */
  notes: Note[];
  /** Filter metadata aligned by index with the sorted notes. */
  metadata: NoteFilterMetadata[];
}

const noteFilterMetadataCache = new WeakMap<Note, NoteFilterMetadata>();

function compareNotesBySortField(sortBy: SortBy) {
  return (noteA: Note, noteB: Note) => {
    const valueA =
      sortBy === "updatedAt"
        ? (noteA.updatedAt ?? noteA.createdAt)
        : noteA.createdAt;
    const valueB =
      sortBy === "updatedAt"
        ? (noteB.updatedAt ?? noteB.createdAt)
        : noteB.createdAt;

    if (valueA < valueB) {
      return 1;
    }

    if (valueA > valueB) {
      return -1;
    }

    return 0;
  };
}

function buildDateMetadata(value: string): NoteDateMetadata {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return {
    dateKey: getDateKeyFromParts(year, month, day),
    day,
    month,
    monthId: `${year}-${month}`,
    year,
  };
}

function getSearchText(note: Note): string {
  return `${note.title}\n${note.summary}`.toLowerCase();
}

function buildNoteMetadata(note: Note): NoteFilterMetadata {
  const cachedMetadata = noteFilterMetadataCache.get(note);
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const metadata = {
    id: note.id,
    createdAt: buildDateMetadata(note.createdAt),
    searchText: getSearchText(note),
    tagIdSet: new Set(note.tagIds),
    updatedAt: buildDateMetadata(note.updatedAt ?? note.createdAt),
  };

  noteFilterMetadataCache.set(note, metadata);
  return metadata;
}

/**
 * Normalizes a free-text search query for note filtering.
 */
export function normalizeNoteSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Builds cached note metadata aligned with the provided note array order.
 */
export function buildNoteFilterMetadata(notes: Note[]): NoteFilterMetadata[] {
  return notes.map(buildNoteMetadata);
}

/**
 * Builds a sorted note array with metadata aligned by index for timeline consumers.
 */
export function buildSortedNoteFilterMetadata(
  notes: Note[],
  sortBy: SortBy,
): SortedNoteFilterMetadata {
  const sortedNotes = [...notes].sort(compareNotesBySortField(sortBy));

  return {
    notes: sortedNotes,
    metadata: buildNoteFilterMetadata(sortedNotes),
  };
}

/**
 * Returns the grouping/filtering date parts for the current sort field.
 */
export function getNoteDateMetadata(
  metadata: NoteFilterMetadata,
  sortBy: SortBy,
): NoteDateMetadata {
  return sortBy === "updatedAt" ? metadata.updatedAt : metadata.createdAt;
}

/**
 * Converts a Date object to the local-time date key used by note filters.
 */
export function getDateKey(date: Date): string {
  return getDateKeyFromParts(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
}

/**
 * Builds date note counts for the current active note set.
 */
export function buildNoteCountsByDate(
  notes: Note[],
  options: {
    searchQuery: string;
    sortBy: SortBy;
  },
): Map<string, number> {
  return buildNoteCountsByDateFromMetadata(
    buildNoteFilterMetadata(notes),
    options,
  );
}

/**
 * Builds date note counts from cached note metadata without reprocessing full note objects.
 */
export function buildNoteCountsByDateFromMetadata(
  noteFilterMetadata: NoteFilterMetadata[],
  options: {
    searchQuery: string;
    sortBy: SortBy;
  },
): Map<string, number> {
  const counts = new Map<string, number>();
  const query = normalizeNoteSearchQuery(options.searchQuery);

  for (const metadata of noteFilterMetadata) {
    if (query && !metadata.searchText.includes(query)) {
      continue;
    }

    const dateKey = getNoteDateMetadata(metadata, options.sortBy).dateKey;
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return counts;
}

/**
 * Builds tag note counts for the current active note set.
 */
export function buildTagNoteCounts(
  notes: Note[],
  options: {
    selectedDate: Date | null;
    sortBy: SortBy;
  },
): Map<string, number> {
  return buildTagNoteCountsFromMetadata(
    buildNoteFilterMetadata(notes),
    options,
  );
}

/**
 * Builds tag note counts from cached note metadata without reprocessing full note objects.
 */
export function buildTagNoteCountsFromMetadata(
  noteFilterMetadata: NoteFilterMetadata[],
  options: {
    selectedDate: Date | null;
    sortBy: SortBy;
  },
): Map<string, number> {
  const counts = new Map<string, number>();
  const selectedDateKey = options.selectedDate
    ? getDateKey(options.selectedDate)
    : null;

  for (const metadata of noteFilterMetadata) {
    if (selectedDateKey) {
      const noteDateKey = getNoteDateMetadata(metadata, options.sortBy).dateKey;
      if (noteDateKey !== selectedDateKey) {
        continue;
      }
    }

    for (const tagId of metadata.tagIdSet) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Checks whether cached note date parts match a selected local-time date.
 */
export function matchesSelectedDate(
  dateMetadata: NoteDateMetadata,
  selectedDate: Date,
): boolean {
  return dateMetadata.dateKey === getDateKey(selectedDate);
}

function getDateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
