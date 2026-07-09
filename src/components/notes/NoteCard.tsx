import { deleteNoteAction } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { Note, SortBy } from "@/types";
import { Calendar, Check, Clock, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface NoteCardProps {
  note: Note;
  isSelected?: boolean;
  isLastSelected?: boolean;
  isGenerating?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  directoryPathLabel?: string;
  sortBy: SortBy;
  isMultiSelectMode?: boolean;
  isMultiSelected?: boolean;
  onToggleMultiSelect?: (id: string) => void;
}

function areStringArraysEqual(a: readonly string[], b: readonly string[]) {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Component for displaying a summarized view of a note in a list.
 *
 * @param props - Component properties.
 * @param props.note - The note object to display.
 * @param props.isSelected - Whether the note is currently selected.
 * @param props.isLastSelected - Whether the note was the last one selected/closed.
 * @param props.isGenerating - Whether AI is currently generating content for this note.
 * @returns A card UI representing a single note.
 */
export const NoteCard = React.memo<NoteCardProps>(
  ({
    note,
    isSelected,
    isLastSelected,
    isGenerating,
    isExpanded,
    onToggleExpand,
    directoryPathLabel,
    sortBy,
    isMultiSelectMode,
    isMultiSelected,
    onToggleMultiSelect,
  }) => {
    const { t, i18n } = useTranslation();
    const deleteNote = useStore((state) => state.deleteNote);
    const confirmNoteSelection = useStore(
      (state) => state.confirmNoteSelection,
    );
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const displayedDate = useMemo(
      () =>
        new Date(
          sortBy === "updatedAt"
            ? note.updatedAt || note.createdAt
            : note.createdAt,
        ).toLocaleDateString(i18n.language),
      [i18n.language, note.createdAt, note.updatedAt, sortBy],
    );

    /**
     * Deletes the current note after user confirmation.
     *
     * @param e - The mouse event from the delete button.
     */
    const handleDelete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        deleteNote(note.id);
        await deleteNoteAction(note.id);
        toast.success(t("note.deleted"));
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast.error(t("note.failedToDelete"));
      } finally {
        setShowDeleteConfirm(false);
      }
    };

    return (
      <>
        <div
          onClick={() => {
            if (isGenerating) return;
            if (isMultiSelectMode) {
              onToggleMultiSelect?.(note.id);
            } else {
              confirmNoteSelection(note.id);
            }
          }}
          className={cn(
            "group relative h-full rounded-xl border p-4",
            isGenerating
              ? "animate-glow cursor-wait overflow-hidden border-primary/50 bg-primary/5"
              : "cursor-pointer",
            !isGenerating &&
              isMultiSelectMode &&
              (isMultiSelected
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:shadow-md"),
            !isGenerating &&
              !isMultiSelectMode &&
              (isSelected
                ? "border-primary bg-primary/10 shadow-sm"
                : isLastSelected
                  ? "border-muted-foreground/50 bg-muted shadow-sm ring-1 ring-border"
                  : "border-border bg-card hover:shadow-md"),
          )}
        >
          {isMultiSelectMode && (
            <div
              className={cn(
                "absolute top-3 left-3 z-10 flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors",
                isMultiSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 bg-background",
              )}
            >
              {isMultiSelected && <Check size={12} strokeWidth={3} />}
            </div>
          )}
          {isGenerating && (
            <div className="pointer-events-none absolute inset-0">
              <div className="animate-shimmer absolute inset-0 w-full bg-linear-to-r from-transparent via-blue-400/10 to-transparent" />
            </div>
          )}

          <div className="mb-2 flex items-start justify-between">
            <h3
              className={cn(
                "pr-6 text-sm font-semibold",
                isMultiSelectMode && "pl-6",
                isExpanded ? "whitespace-normal" : "truncate",
                isGenerating && "text-primary",
              )}
            >
              {note.title}
            </h3>
            {!isGenerating && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="absolute top-3 right-3 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                aria-label="Delete note"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
          <p
            className={cn(
              "mb-1 text-xs text-muted-foreground",
              isExpanded ? "" : "line-clamp-2",
              isGenerating && "opacity-80",
            )}
          >
            {note.summary}
          </p>
          <button
            type="button"
            disabled={isGenerating}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className={cn(
              "mb-3 text-[0.6rem] font-medium transition-colors focus:outline-none",
              isGenerating
                ? "cursor-wait text-primary/50"
                : "text-primary hover:text-primary/80",
            )}
          >
            {isExpanded ? t("common.showLess") : t("common.showMore")}
          </button>
          <div className="flex items-center text-[0.6rem] text-muted-foreground">
            {sortBy === "updatedAt" ? (
              <Clock size={20} className="mr-1 text-primary" />
            ) : (
              <Calendar size={20} className="mr-1" />
            )}
            {displayedDate}
            <span className="mx-2">•</span>
            <span className="truncate">
              {directoryPathLabel || t("common.uncategorized")}
            </span>
          </div>
        </div>

        {showDeleteConfirm && (
          <div
            className="fixed inset-0 z-100 flex animate-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200 fade-in"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
          >
            <div
              className="w-full max-w-[320px] animate-in rounded-2xl bg-card p-6 shadow-2xl duration-200 zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-lg font-semibold">
                {t("note.deleteTitle")}
              </h3>
              <p className="mb-6 text-sm text-muted-foreground">
                {t("note.deleteDescription")}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.isLastSelected === next.isLastSelected &&
      prev.isGenerating === next.isGenerating &&
      prev.isExpanded === next.isExpanded &&
      prev.sortBy === next.sortBy &&
      prev.directoryPathLabel === next.directoryPathLabel &&
      prev.isMultiSelectMode === next.isMultiSelectMode &&
      prev.isMultiSelected === next.isMultiSelected &&
      prev.note.id === next.note.id &&
      prev.note.updatedAt === next.note.updatedAt &&
      prev.note.createdAt === next.note.createdAt &&
      prev.note.directoryId === next.note.directoryId &&
      prev.note.title === next.note.title &&
      prev.note.summary === next.note.summary &&
      areStringArraysEqual(prev.note.tagIds, next.note.tagIds)
    );
  },
);
