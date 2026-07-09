import { NoteCard } from "@/components/notes/NoteCard";
import { cn } from "@/lib/utils";
import type {
  VirtualHeaderItem,
  VirtualItem,
  VirtualNoteItem,
} from "@/lib/virtualization/TimelineManager";
import { getDirectoryPathResolver } from "@/store/helpers";
import { useStore } from "@/store/useStore";
import type { SortBy } from "@/types";
import { Check, Minus } from "lucide-react";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface VirtualizedNoteListProps {
  visibleItems: VirtualItem[];
  /** Timeline revision that invalidates memoized renders after manager mutations. */
  timelineVersion: string;
  selectedNoteId: string | null;
  lastSelectedNoteId: string | null;
  expandedNoteIds: Set<string>;
  sortBy: SortBy;
  onToggleExpand: (id: string) => void;
  isMultiSelectMode: boolean;
  selectedNoteIds: Set<string>;
  onToggleMultiSelect: (id: string) => void;
  onSelectMonthNotes: (noteIds: string[]) => void;
  isMobile: boolean;
}

/**
 * Renders the virtualized list of notes and month headers.
 * Handles both header items (month/year labels) and note items.
 */
function VirtualizedNoteListComponent({
  visibleItems,
  timelineVersion,
  selectedNoteId,
  lastSelectedNoteId,
  expandedNoteIds,
  sortBy,
  onToggleExpand,
  isMultiSelectMode,
  selectedNoteIds,
  onToggleMultiSelect,
  onSelectMonthNotes,
  isMobile,
}: VirtualizedNoteListProps) {
  const { t } = useTranslation();
  const directories = useStore((state) => state.directories);
  const directoryPathResolver = useMemo(
    () => getDirectoryPathResolver(directories),
    [directories],
  );
  const directoryPathLabels = useMemo(() => {
    const labels = new Map<string, string>();

    for (const item of visibleItems) {
      if (item.type !== "note" || !item.data.note.directoryId) {
        continue;
      }

      const directoryId = item.data.note.directoryId;
      if (!labels.has(directoryId)) {
        labels.set(
          directoryId,
          directoryPathResolver.getPathLabel(directoryId),
        );
      }
    }

    return labels;
  }, [directoryPathResolver, timelineVersion, visibleItems]);
  const selectedCountsByHeaderId = useMemo(() => {
    const counts = new Map<string, number>();
    if (selectedNoteIds.size === 0) {
      return counts;
    }

    for (const item of visibleItems) {
      if (item.type !== "header") {
        continue;
      }

      let count = 0;
      for (const noteId of item.data.noteIds) {
        if (selectedNoteIds.has(noteId)) {
          count++;
        }
      }
      counts.set(item.data.id, count);
    }

    return counts;
  }, [selectedNoteIds, timelineVersion, visibleItems]);

  return (
    <>
      {visibleItems.map((item) => {
        if (item.type === "header") {
          return (
            <MonthHeader
              key={item.data.id}
              data={item.data}
              t={t}
              isMobile={isMobile}
              isMultiSelectMode={isMultiSelectMode}
              selectedCount={selectedCountsByHeaderId.get(item.data.id) ?? 0}
              onSelectMonthNotes={onSelectMonthNotes}
            />
          );
        } else {
          return (
            <NoteItem
              key={item.data.id}
              data={item.data}
              isSelected={item.data.id === selectedNoteId}
              isLastSelected={item.data.id === lastSelectedNoteId}
              isExpanded={expandedNoteIds.has(item.data.id)}
              sortBy={sortBy}
              directoryPathLabel={
                item.data.note.directoryId
                  ? (directoryPathLabels.get(item.data.note.directoryId) ??
                    t("common.uncategorized"))
                  : t("common.uncategorized")
              }
              onToggleExpand={onToggleExpand}
              isMultiSelectMode={isMultiSelectMode}
              isMultiSelected={selectedNoteIds.has(item.data.id)}
              onToggleMultiSelect={onToggleMultiSelect}
            />
          );
        }
      })}
    </>
  );
}

export const VirtualizedNoteList = memo(VirtualizedNoteListComponent);
VirtualizedNoteList.displayName = "VirtualizedNoteList";

interface MonthHeaderProps {
  data: VirtualHeaderItem;
  t: (key: string, options?: Record<string, unknown>) => string;
  isMobile: boolean;
  isMultiSelectMode: boolean;
  selectedCount: number;
  onSelectMonthNotes: (noteIds: string[]) => void;
}

/**
 * Renders a sticky month header in the virtualized timeline.
 */
function MonthHeader({
  data,
  t,
  isMobile,
  isMultiSelectMode,
  selectedCount,
  onSelectMonthNotes,
}: MonthHeaderProps) {
  const allSelected = selectedCount === data.count && data.count > 0;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div
      className="absolute w-full"
      style={{
        top: data.y,
        height: data.groupHeight,
        pointerEvents: "none",
      }}
    >
      <div
        className={cn(
          "pointer-events-auto sticky z-10 flex items-center gap-4 bg-background",
          isMobile
            ? "top-0 -mx-4 mb-4 px-4 py-2"
            : "-top-8 -mx-8 mb-6 px-8 pt-10 pb-2",
        )}
      >
        <div className="flex items-center gap-3">
          {isMultiSelectMode && (
            <button
              type="button"
              onClick={() => onSelectMonthNotes(data.noteIds)}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                allSelected || someSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 bg-background hover:border-muted-foreground/60",
              )}
              aria-label={t(
                allSelected ? "batch.deselectMonth" : "batch.selectMonth",
              )}
            >
              {allSelected && <Check size={12} strokeWidth={3} />}
              {someSelected && <Minus size={12} strokeWidth={3} />}
            </button>
          )}
          <h2 className="text-lg font-bold">
            {t(`common.months.${data.month}`)}
            <span className="ml-2 text-sm font-normal">{data.year}</span>
          </h2>
        </div>
        <div className="h-px flex-1" />
        {isMultiSelectMode && someSelected && (
          <span className="text-xs font-medium text-primary">
            {selectedCount}/{data.count}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {t("home.notesCount", { count: data.count })}
        </span>
      </div>
    </div>
  );
}

interface NoteItemProps {
  data: VirtualNoteItem;
  isSelected: boolean;
  isLastSelected: boolean;
  isExpanded: boolean;
  sortBy: SortBy;
  directoryPathLabel: string;
  onToggleExpand: (id: string) => void;
  isMultiSelectMode: boolean;
  isMultiSelected: boolean;
  onToggleMultiSelect: (id: string) => void;
}

/**
 * Renders a single note card positioned absolutely within the virtualized grid.
 */
function NoteItem({
  data,
  isSelected,
  isLastSelected,
  isExpanded,
  sortBy,
  directoryPathLabel,
  onToggleExpand,
  isMultiSelectMode,
  isMultiSelected,
  onToggleMultiSelect,
}: NoteItemProps) {
  const handleToggleExpand = useCallback(() => {
    onToggleExpand(data.id);
  }, [onToggleExpand, data.id]);

  return (
    <div
      className="absolute"
      style={{
        top: data.y,
        left: data.x,
        width: data.width,
        height: data.height,
      }}
    >
      <NoteCard
        note={data.note}
        isSelected={isSelected}
        isLastSelected={isLastSelected}
        isExpanded={isExpanded}
        sortBy={sortBy}
        directoryPathLabel={directoryPathLabel}
        onToggleExpand={handleToggleExpand}
        isMultiSelectMode={isMultiSelectMode}
        isMultiSelected={isMultiSelected}
        onToggleMultiSelect={onToggleMultiSelect}
      />
    </div>
  );
}
