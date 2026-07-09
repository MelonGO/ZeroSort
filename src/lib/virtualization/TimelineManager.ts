import {
  buildNoteFilterMetadata,
  getDateKey,
  getNoteDateMetadata,
  normalizeNoteSearchQuery,
  type NoteFilterMetadata,
} from "@/lib/notes/noteDerivedData";
import type { Note, SortBy } from "@/types";
import { Virtualizer } from "@tanstack/react-virtual";
import { VirtualScrollManager } from "./VirtualScrollManager";

/**
 * Represents a group of notes within a specific month for the virtualized timeline.
 */
export interface VirtualMonthGroup {
  /** Unique identifier for the group, typically "year-month". */
  id: string;
  /** The calendar year of the group. */
  year: number;
  /** The month index (1-12). */
  month: number;
  /** Display title for the group (e.g., "January"). */
  title: string;
  /** The vertical Y position in the scrollable area. */
  y: number;
  /** The total height of the group in pixels. */
  height: number;
  /** Number of notes contained in this group. */
  notesCount: number;
  /** Indices of the notes in the flattened notes array. */
  noteIndices: number[];
}

/**
 * Represents lightweight layout metadata for a note in the virtualized grid.
 */
interface VirtualNoteLayout {
  /** Unique identifier of the note. */
  id: string;
  /** Index of the note in the sorted notes array. */
  noteIndex: number;
  /** The vertical Y position. */
  y: number;
  /** The horizontal X position. */
  x: number;
  /** The width of the note card. */
  width: number;
  /** The height of the note card. */
  height: number;
  /** Pre-built VirtualNoteItem to avoid allocation in updateIntersections. */
  item: VirtualNoteItem;
  /** Pre-built VirtualItem wrapper to avoid allocation in updateIntersections. */
  wrapper: VirtualItem;
}

/**
 * Represents a virtualized layout block used by TanStack Virtual.
 */
interface TimelineLayoutBlockBase {
  /** Stable block identifier used by the virtualizer. */
  id: string;
  /** Month group identifier the block belongs to. */
  groupId: string;
  /** The vertical Y position. */
  y: number;
  /** The virtual block size, including trailing gap. */
  size: number;
}

/**
 * Spacer block that reserves the month header area in the virtual timeline.
 */
interface TimelineHeaderSpacerBlock extends TimelineLayoutBlockBase {
  type: "headerSpacer";
}

/**
 * Row block that contains the note items for a single grid row.
 */
interface TimelineNoteRowBlock extends TimelineLayoutBlockBase {
  type: "noteRow";
  /** Pre-built note layouts rendered for this row. */
  noteLayouts: VirtualNoteLayout[];
}

/**
 * Union for all TanStack Virtual timeline blocks.
 */
type TimelineLayoutBlock = TimelineHeaderSpacerBlock | TimelineNoteRowBlock;

/**
 * Creates a stable scroll element placeholder for TanStack Virtual in non-DOM contexts.
 */
function createVirtualScrollElement() {
  if (typeof document !== "undefined") {
    return document.createElement("div");
  }

  return {
    addEventListener: () => {},
    clientHeight: 0,
    clientWidth: 0,
    getBoundingClientRect: () =>
      ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      }) as DOMRect,
    nodeType: 1,
    removeEventListener: () => {},
    scrollLeft: 0,
    scrollTop: 0,
  } as unknown as HTMLDivElement;
}

/**
 * Represents a single visible note item positioned within the virtualized grid.
 */
export interface VirtualNoteItem {
  /** Unique identifier of the note. */
  id: string;
  /** Index of the note in the sorted notes array. */
  noteIndex: number;
  /** The actual note data. */
  note: Note;
  /** The vertical Y position. */
  y: number;
  /** The horizontal X position. */
  x: number;
  /** The width of the note card. */
  width: number;
  /** The height of the note card. */
  height: number;
}

/**
 * Represents a header item (e.g., a month/year label) in the virtualized timeline.
 */
export interface VirtualHeaderItem {
  /** Unique identifier for the header. */
  id: string;
  /** Display title for the header. */
  title: string;
  /** The month (1-12) associated with this header. */
  month: number;
  /** The year associated with this header. */
  year: number;
  /** The count of notes under this header. */
  count: number;
  /** The vertical Y position. */
  y: number;
  /** The height of the header element. */
  height: number;
  /** The total height of the group this header belongs to. */
  groupHeight: number;
  /** IDs of all notes in this month group. */
  noteIds: string[];
}

interface CachedMonthGroup {
  id: string;
  indices: number[];
  month: number;
  sortKey: number;
  title: string;
  year: number;
}

/**
 * Union type for items that can be rendered in the virtualized timeline.
 */
export type VirtualItem =
  | { type: "header"; data: VirtualHeaderItem }
  | { type: "note"; data: VirtualNoteItem };

/**
 * Manages the layout and virtualization of the timeline view.
 * Organizes notes into month groups and calculates their precise positions
 * in a multi-column grid within the scrollable area.
 *
 * Extends {@link VirtualScrollManager} to leverage base virtualization logic.
 */
export class TimelineManager extends VirtualScrollManager {
  private _layoutVersion = 0;
  private _notes: Note[] = [];
  private _noteFilterMetadata: NoteFilterMetadata[] = [];
  private _monthGroups: VirtualMonthGroup[] = [];
  private _layoutBlocks: TimelineLayoutBlock[] = [];
  private _noteLayouts: VirtualNoteLayout[] = [];
  private _notePositions = new Map<string, number>();
  private _headerItems: VirtualHeaderItem[] = [];
  private _headerWrappers: Map<string, VirtualItem> = new Map();
  private _visibleItems: VirtualItem[] = [];
  private _prevVisibleKey = "";
  private _noteCountsByDate = new Map<string, number>();
  private _tagNoteCounts = new Map<string, number>();

  private _columns = 3;
  private _expandedNoteIds = new Set<string>();
  private _buffer = 400; // pixels to render above/below viewport
  private _needsGrouping = true;
  private _cachedGroups: Record<string, CachedMonthGroup> = {};
  private _sortedMonthIds: string[] = [];
  private _sortBy: SortBy = "createdAt";
  private _searchQuery = "";
  private _selectedDate: Date | null = null;
  private _selectedTagIds = new Set<string>();
  private _tagFilterMode: "and" | "or" = "or";
  private _virtualizerRectObserver:
    | ((rect: { width: number; height: number }) => void)
    | null = null;
  private _virtualizerOffsetObserver:
    | ((offset: number, isScrolling: boolean) => void)
    | null = null;
  private readonly _virtualScrollElement = createVirtualScrollElement();
  private _virtualizer: Virtualizer<HTMLDivElement, HTMLDivElement> | null =
    null;
  private _virtualizerCleanup: (() => void) | null = null;

  constructor() {
    super();
    this._virtualizer = new Virtualizer<HTMLDivElement, HTMLDivElement>({
      count: 0,
      getScrollElement: () => this._virtualScrollElement,
      estimateSize: (index) =>
        this._layoutBlocks[index]?.size ?? this.rowHeight + this.gap,
      getItemKey: (index) => this._layoutBlocks[index]?.id ?? index,
      overscan: this._getVirtualizerOverscan(),
      scrollToFn: () => {},
      observeElementRect: (_instance, cb) => {
        this._virtualizerRectObserver = cb;
        cb({
          width: this.viewportWidth,
          height: this.viewportHeight,
        });
        return () => {
          if (this._virtualizerRectObserver === cb) {
            this._virtualizerRectObserver = null;
          }
        };
      },
      observeElementOffset: (_instance, cb) => {
        this._virtualizerOffsetObserver = cb;
        cb(this.scrollTop, this.scrolling);
        return () => {
          if (this._virtualizerOffsetObserver === cb) {
            this._virtualizerOffsetObserver = null;
          }
        };
      },
    });
    // TimelineManager runs the virtualizer outside React, so it needs to manually
    // bridge the lifecycle hooks that useVirtualizer would normally wire up.
    this._virtualizerCleanup = this._virtualizer._didMount();
    this._virtualizer._willUpdate();
    this.setLayoutOptions({
      headerHeight: 60,
      rowHeight: 150,
      gap: 16,
    });
  }

  /**
   * Updates the set of expanded note IDs and refreshes the layout.
   *
   * @param value - The new set of expanded note IDs.
   */
  set expandedNoteIds(value: Set<string>) {
    this._expandedNoteIds = value;
    this.refreshLayout();
  }

  get expandedNoteIds() {
    return this._expandedNoteIds;
  }

  /**
   * Updates the sorting field and refreshes the layout.
   *
   * @param value - The sorting field ('createdAt' or 'updatedAt').
   */
  set sortBy(value: SortBy) {
    if (this._sortBy !== value) {
      this._sortBy = value;
      this._sortNotes();
      this._refreshNoteFilterMetadata();
      this._needsGrouping = true;
      this.refreshLayout();
    }
  }

  get sortBy() {
    return this._sortBy;
  }

  /**
   * Updates sorted notes and matching filter metadata in one pass.
   */
  setTimelineData(
    notes: Note[],
    noteFilterMetadata: NoteFilterMetadata[],
    sortBy: SortBy,
  ) {
    if (
      this._notes === notes &&
      this._noteFilterMetadata === noteFilterMetadata &&
      this._sortBy === sortBy
    ) {
      return;
    }

    this._notes = notes;
    this._noteFilterMetadata = noteFilterMetadata;
    this._sortBy = sortBy;
    this._needsGrouping = true;
    this.refreshLayout();
  }

  set searchQuery(value: string) {
    if (this._searchQuery !== value) {
      this._searchQuery = value;
      this._needsGrouping = true;
      this.refreshLayout();
    }
  }

  get searchQuery() {
    return this._searchQuery;
  }

  /**
   * Updates the selected date filter and refreshes the layout.
   *
   * @param value - The date to filter by, or null to clear the filter.
   */
  set selectedDate(value: Date | null) {
    const currentDate = this._selectedDate;
    const isSameDate =
      currentDate === value ||
      (currentDate &&
        value &&
        currentDate.getFullYear() === value.getFullYear() &&
        currentDate.getMonth() === value.getMonth() &&
        currentDate.getDate() === value.getDate());

    if (!isSameDate) {
      this._selectedDate = value;
      this._needsGrouping = true;
      this.refreshLayout();
    }
  }

  get selectedDate() {
    return this._selectedDate;
  }

  set selectedTagIds(value: Set<string>) {
    if (this._selectedTagIds !== value) {
      this._selectedTagIds = value;
      this._needsGrouping = true;
      this.refreshLayout();
    }
  }

  get selectedTagIds() {
    return this._selectedTagIds;
  }

  set tagFilterMode(value: "and" | "or") {
    if (this._tagFilterMode !== value) {
      this._tagFilterMode = value;
      this._needsGrouping = true;
      this.refreshLayout();
    }
  }

  get tagFilterMode() {
    return this._tagFilterMode;
  }

  /**
   * Internal helper to sort notes based on current sortBy field.
   */
  private _sortNotes() {
    // Only sort if we have a significant number of notes or if explicitly requested.
    // For 100k items, sorting takes ~50-100ms.
    this._notes.sort((a, b) => {
      const dateA =
        this._sortBy === "updatedAt" ? a.updatedAt || a.createdAt : a.createdAt;
      const dateB =
        this._sortBy === "updatedAt" ? b.updatedAt || b.createdAt : b.createdAt;
      if (dateA < dateB) return 1;
      if (dateA > dateB) return -1;
      return 0;
    });
  }

  /**
   * Rebuilds cached note metadata aligned to the current sorted note order.
   */
  private _refreshNoteFilterMetadata() {
    this._noteFilterMetadata = buildNoteFilterMetadata(this._notes);
  }

  /**
   * Updates the notes list and refreshes the layout.
   * Notes are automatically sorted by the selected date in descending order.
   *
   * @param newNotes - The new array of notes to display.
   */
  set notes(newNotes: Note[]) {
    this._notes = newNotes; // Avoid spreading 100k items if possible
    this._sortNotes();
    this._refreshNoteFilterMetadata();
    this._needsGrouping = true;
    this.refreshLayout();
  }

  get notes() {
    return this._notes;
  }

  /**
   * Sets the number of columns in the grid layout and refreshes the layout.
   *
   * @param value - The number of columns (typically 1, 2, or 3).
   */
  set columns(value: number) {
    if (this._columns !== value) {
      this._columns = value;
      this.refreshLayout();
    }
  }

  /**
   * Gets the calculated month group positions and metadata.
   */
  get monthGroups() {
    return this._monthGroups;
  }

  /**
   * Gets the items (headers and notes) that should currently be rendered in the viewport.
   */
  get visibleItems() {
    return this._visibleItems;
  }

  /**
   * Gets date counts derived during the latest grouping pass.
   */
  get noteCountsByDate() {
    return this._noteCountsByDate;
  }

  /**
   * Gets tag counts derived during the latest grouping pass.
   */
  get tagNoteCounts() {
    return this._tagNoteCounts;
  }

  /**
   * Gets the layout version used by scrubber subscriptions.
   */
  get layoutVersion() {
    return this._layoutVersion;
  }

  /**
   * Syncs the internal TanStack Virtual instance to the latest layout blocks and viewport.
   */
  private _syncVirtualizer() {
    if (!this._virtualizer) {
      return;
    }

    this._virtualizer.setOptions({
      ...this._virtualizer.options,
      count: this._layoutBlocks.length,
      estimateSize: (index) =>
        this._layoutBlocks[index]?.size ?? this.rowHeight + this.gap,
      getItemKey: (index) => this._layoutBlocks[index]?.id ?? index,
      overscan: this._getVirtualizerOverscan(),
      initialRect: {
        width: this.viewportWidth,
        height: this.viewportHeight,
      },
    });
    this._virtualizerRectObserver?.({
      width: this.viewportWidth,
      height: this.viewportHeight,
    });
    this._virtualizerOffsetObserver?.(this.scrollTop, this.scrolling);
    this._virtualizer.measure();
  }

  /**
   * Converts the existing pixel buffer to an approximate TanStack Virtual overscan item count.
   */
  private _getVirtualizerOverscan() {
    return Math.max(2, Math.ceil(this._buffer / Math.max(1, this.rowHeight)));
  }

  /**
   * Rebuilds filtered month groups plus filter count metadata in a single note scan.
   */
  private _rebuildDerivedNoteData() {
    this._cachedGroups = {};
    this._noteCountsByDate = new Map();
    this._tagNoteCounts = new Map();

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const query = normalizeNoteSearchQuery(this._searchQuery);
    const selectedDateKey = this._selectedDate
      ? getDateKey(this._selectedDate)
      : null;
    const hasTagFilter = this._selectedTagIds.size > 0;
    const selectedTagIds = hasTagFilter ? [...this._selectedTagIds] : [];

    for (let i = 0; i < this._notes.length; i++) {
      const noteMetadata = this._noteFilterMetadata[i];
      if (!noteMetadata) {
        continue;
      }

      const queryMatches =
        query.length === 0 || noteMetadata.searchText.includes(query);

      if (queryMatches) {
        const countDateKey = getNoteDateMetadata(
          noteMetadata,
          this._sortBy,
        ).dateKey;
        this._noteCountsByDate.set(
          countDateKey,
          (this._noteCountsByDate.get(countDateKey) ?? 0) + 1,
        );
      }

      if (selectedDateKey) {
        const tagCountDateKey = getNoteDateMetadata(
          noteMetadata,
          this._sortBy,
        ).dateKey;
        if (tagCountDateKey !== selectedDateKey) {
          continue;
        }
      }

      for (const tagId of noteMetadata.tagIdSet) {
        this._tagNoteCounts.set(
          tagId,
          (this._tagNoteCounts.get(tagId) ?? 0) + 1,
        );
      }

      if (!queryMatches) {
        continue;
      }

      if (hasTagFilter) {
        const matches =
          this._tagFilterMode === "and"
            ? selectedTagIds.every((id) => noteMetadata.tagIdSet.has(id))
            : selectedTagIds.some((id) => noteMetadata.tagIdSet.has(id));
        if (!matches) continue;
      }

      const dateMetadata = getNoteDateMetadata(noteMetadata, this._sortBy);

      if (selectedDateKey && dateMetadata.dateKey !== selectedDateKey) {
        continue;
      }

      const { year, month, monthId } = dateMetadata;

      if (!this._cachedGroups[monthId]) {
        this._cachedGroups[monthId] = {
          id: monthId,
          year,
          month,
          sortKey: year * 12 + month,
          title: monthNames[month - 1],
          indices: [],
        };
      }
      this._cachedGroups[monthId].indices.push(i);
    }

    this._sortedMonthIds = Object.values(this._cachedGroups)
      .sort((a, b) => b.sortKey - a.sortKey)
      .map((group) => group.id);
    this._needsGrouping = false;
  }

  /**
   * Recalculates the position of all elements (headers and notes).
   * Groups notes by month and applies a grid layout based on viewport width and columns.
   *
   * @param _changedWidth - Indicates if the recalculation was triggered by a viewport width change.
   */
  protected override updateViewportGeometry(
    changedWidth: boolean,
    forceLayout = false,
  ) {
    if (this._notes.length === 0 || this.hasEmptyViewport) {
      if (this._notes.length === 0) {
        const hadLayout =
          this._monthGroups.length > 0 ||
          this._layoutBlocks.length > 0 ||
          this._noteLayouts.length > 0 ||
          this._headerItems.length > 0 ||
          this._headerWrappers.size > 0 ||
          this._visibleItems.length > 0 ||
          this._prevVisibleKey !== "" ||
          this.bodySectionHeight !== 0;
        this._monthGroups.length = 0;
        this._layoutBlocks.length = 0;
        this._noteLayouts.length = 0;
        this._notePositions.clear();
        this._headerItems.length = 0;
        this._visibleItems = [];
        this.bodySectionHeight = 0;
        this._headerWrappers.clear();
        this._noteCountsByDate = new Map();
        this._tagNoteCounts = new Map();
        this._syncVirtualizer();
        this._prevVisibleKey = "";
        this._layoutVersion += 1;
        return hadLayout;
      }
      if (this._needsGrouping) {
        this._rebuildDerivedNoteData();
        this._layoutVersion += 1;
        return true;
      }
      return false;
    }

    if (!forceLayout && !changedWidth && !this._needsGrouping) {
      return false;
    }

    if (this._needsGrouping) {
      this._rebuildDerivedNoteData();
    }

    const groups = this._monthGroups;
    const layoutBlocks = this._layoutBlocks;
    const noteLayouts = this._noteLayouts;
    const headerItems = this._headerItems;
    const notePositions = this._notePositions;

    groups.length = 0;
    layoutBlocks.length = 0;
    noteLayouts.length = 0;
    headerItems.length = 0;
    notePositions.clear();
    this._headerWrappers.clear();

    let currentY = this.topSectionHeight;
    // Calculate the available width for each column, accounting for the gaps between them.
    const colWidth =
      (this.viewportWidth - (this._columns - 1) * this.gap) / this._columns;

    this._sortedMonthIds.forEach((monthId) => {
      const g = this._cachedGroups[monthId];
      const groupY = currentY;

      // Determine how many rows are needed for this month's notes based on current column count.
      const rowCount = Math.ceil(g.indices.length / this._columns);
      const notesForHeader = this._notes;
      let cachedHeaderNoteIds: string[] | null = null;

      // First, calculate the height of each row in this group.
      const rowHeights: number[] = [];
      for (let r = 0; r < rowCount; r++) {
        let maxRowHeight = this.rowHeight;
        for (let c = 0; c < this._columns; c++) {
          const idx = r * this._columns + c;
          if (idx < g.indices.length) {
            const note = this._notes[g.indices[idx]];
            const isExpanded = this._expandedNoteIds.has(note.id);
            if (isExpanded) {
              const estimatedHeight = this._estimateNoteHeight(note, colWidth);
              maxRowHeight = Math.max(maxRowHeight, estimatedHeight);
            }
          }
        }
        rowHeights.push(maxRowHeight);
      }

      // Calculate total group height: header + spacer + sum(row heights) + row spacers.
      const rowsTotalHeight = rowHeights.reduce((sum, h) => sum + h, 0);
      const groupHeight =
        this.headerHeight +
        this.gap +
        rowsTotalHeight +
        (rowCount > 0 ? rowCount * this.gap : 0);

      const headerItem: VirtualHeaderItem = {
        id: monthId,
        title: g.title,
        month: g.month,
        year: g.year,
        count: g.indices.length,
        y: currentY,
        height: this.headerHeight,
        groupHeight,
        get noteIds() {
          cachedHeaderNoteIds ??= g.indices.map((i) => notesForHeader[i].id);
          return cachedHeaderNoteIds;
        },
      };
      headerItems.push(headerItem);
      layoutBlocks.push({
        id: `header:${monthId}`,
        type: "headerSpacer",
        groupId: monthId,
        y: currentY,
        size: this.headerHeight + this.gap,
      });
      currentY += this.headerHeight + this.gap;

      // Notes in this group
      let rowY = currentY;
      for (let r = 0; r < rowCount; r++) {
        const currentHeight = rowHeights[r];
        const rowNoteLayouts: VirtualNoteLayout[] = [];
        for (let c = 0; c < this._columns; c++) {
          const i = r * this._columns + c;
          if (i >= g.indices.length) break;

          const noteIndex = g.indices[i];
          const note = this._notes[noteIndex];
          const noteItem: VirtualNoteItem = {
            id: note.id,
            noteIndex,
            note,
            y: rowY,
            x: c * (colWidth + this.gap),
            width: colWidth,
            height: currentHeight,
          };
          const noteWrapper: VirtualItem = { type: "note", data: noteItem };
          const noteLayout: VirtualNoteLayout = {
            id: note.id,
            noteIndex,
            y: noteItem.y,
            x: noteItem.x,
            width: noteItem.width,
            height: noteItem.height,
            item: noteItem,
            wrapper: noteWrapper,
          };
          noteLayouts.push(noteLayout);
          rowNoteLayouts.push(noteLayout);
          notePositions.set(noteLayout.id, noteLayout.y);
        }
        layoutBlocks.push({
          id: `row:${monthId}:${r}`,
          type: "noteRow",
          groupId: monthId,
          y: rowY,
          size: currentHeight + this.gap,
          noteLayouts: rowNoteLayouts,
        });
        rowY += currentHeight + this.gap;
      }

      groups.push({
        id: monthId,
        year: g.year,
        month: g.month,
        title: g.title,
        y: groupY,
        height: groupHeight,
        notesCount: g.indices.length,
        noteIndices: g.indices,
      });

      currentY = rowY;
    });

    this.bodySectionHeight = currentY;

    // Pre-build header wrappers so updateIntersections can reuse them
    for (const header of headerItems) {
      this._headerWrappers.set(header.id, { type: "header", data: header });
    }

    this._syncVirtualizer();

    // Invalidate visible items cache since layout changed
    this._prevVisibleKey = "";
    this._layoutVersion += 1;
    return true;
  }

  /**
   * Updates the list of items visible in the current viewport.
   * Includes a buffer area above and below the viewport to ensure smooth scrolling.
   * Reuses pre-built item objects to avoid allocation pressure during rapid scroll/resize.
   */
  protected override updateIntersections() {
    const visible: VirtualItem[] = [];
    const keyParts: string[] = [`layout:${this._layoutVersion}`];
    this._virtualizerRectObserver?.({
      width: this.viewportWidth,
      height: this.viewportHeight,
    });
    this._virtualizerOffsetObserver?.(this.scrollTop, this.scrolling);

    const renderedHeaders = new Set<string>();

    for (const virtualBlock of this._virtualizer?.getVirtualItems() ?? []) {
      const block = this._layoutBlocks[virtualBlock.index];
      if (!block) {
        continue;
      }

      if (!renderedHeaders.has(block.groupId)) {
        const wrapper = this._headerWrappers.get(block.groupId);
        if (wrapper) {
          visible.push(wrapper);
          keyParts.push(`h:${block.groupId}`);
        }
        renderedHeaders.add(block.groupId);
      }

      if (block.type === "noteRow") {
        for (const noteLayout of block.noteLayouts) {
          visible.push(noteLayout.wrapper);
          keyParts.push(`n:${noteLayout.id}`);
        }
      }
    }

    // Build a key to detect if the visible set actually changed
    const newKey = keyParts.join(",");
    if (newKey === this._prevVisibleKey) {
      return false; // Visible set unchanged — skip re-render
    }
    this._prevVisibleKey = newKey;

    this._visibleItems = visible;
    return true;
  }

  /**
   * Calculates the vertical scroll position for a specific year and month.
   *
   * @param year - The year to scroll to.
   * @param month - The month index to scroll to (1-12).
   * @returns The vertical scroll position in pixels. Returns 0 if the month is not found.
   */
  getScrollPositionForMonth(year: number, month: number): number {
    const id = `${year}-${month}`;
    const group = this._monthGroups.find((g) => g.id === id);
    return group ? group.y : 0;
  }

  /**
   * Calculates the vertical scroll position for a specific note.
   *
   * @param noteId - The unique identifier of the note to locate.
   * @returns The vertical scroll position in pixels, or -1 if the note is not found.
   *          Includes a small top padding for better visibility.
   */
  getScrollPositionForNote(noteId: string): number {
    const y = this._notePositions.get(noteId);
    return y !== undefined ? Math.max(0, y - 100) : -1; // -1 if not found, clamp padding to 0
  }

  /**
   * Identifies which month group is currently most prominent in the viewport.
   *
   * @param scrollTop - The current vertical scroll position in pixels.
   * @returns The unique ID of the active month group, or null if no groups exist.
   */
  getActiveMonthId(scrollTop: number): string | null {
    if (this._monthGroups.length === 0) {
      return null;
    }

    const threshold = scrollTop + 100; // Offset to trigger change slightly before it hits the top
    let low = 0;
    let high = this._monthGroups.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const group = this._monthGroups[mid];

      if (threshold < group.y) {
        high = mid - 1;
      } else if (threshold >= group.y + group.height) {
        low = mid + 1;
      } else {
        return group.id;
      }
    }

    return (
      this._monthGroups[Math.max(0, low - 1)]?.id ?? this._monthGroups[0].id
    );
  }

  /**
   * Cleans up TanStack Virtual subscriptions and inherited manager resources.
   */
  override destroy() {
    this._virtualizerCleanup?.();
    super.destroy();
  }

  /**
   * Estimates the height of an expanded note card based on its content.
   *
   * @param note - The note to estimate height for.
   * @param width - The width of the note card.
   * @returns The estimated height in pixels.
   */
  private _estimateNoteHeight(note: Note, width: number): number {
    // Use rowHeight as a base scale factor (default 150)
    const scale = this.rowHeight / 150;
    const internalWidth = Math.max(100, width - 32 * scale);

    // Estimate title height (text-sm: 14px, line-height: 20px)
    const titleLines = this._estimateTextLines(
      note.title,
      internalWidth,
      14 * scale,
    );
    const titleHeight = titleLines * 20 * scale;

    // Estimate summary height (text-xs: 12px, line-height: 16px)
    const summaryLines = this._estimateTextLines(
      note.summary,
      internalWidth,
      12 * scale,
    );
    const summaryHeight = summaryLines * 16 * scale;

    // Base height components:
    const baseHeight = 100 * scale;

    const totalHeight = baseHeight + titleHeight + summaryHeight;

    // Return at least rowHeight, and cap at a reasonable maximum
    return Math.min(Math.max(this.rowHeight, totalHeight), 800 * scale);
  }

  /**
   * Rough estimation of text lines based on character width and available container width.
   */
  private _estimateTextLines(
    text: string,
    width: number,
    fontSize: number,
  ): number {
    if (!text) return 0;

    // Simplified CJK + alphanumeric estimation
    // CJK characters take ~1x fontSize, others ~0.55x fontSize
    const cjkRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;
    const cjkCount = (text.match(cjkRegex) || []).length;
    const otherCount = text.length - cjkCount;

    const estimatedWidth = cjkCount * fontSize + otherCount * fontSize * 0.55;
    return Math.max(1, Math.ceil(estimatedWidth / width));
  }
}
