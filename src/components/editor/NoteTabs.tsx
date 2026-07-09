import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { X } from "lucide-react";
import type { DragEvent } from "react";
import { memo, startTransition, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";

interface DropIndicator {
  noteId: string;
  side: "left" | "right";
}

interface NoteTabProps {
  noteId: string;
  isDragging: boolean;
  dropIndicatorSide: DropIndicator["side"] | null;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, noteId: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, noteId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, noteId: string) => void;
}

const NoteTab = memo<NoteTabProps>(function NoteTab({
  noteId,
  isDragging,
  dropIndicatorSide,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
}) {
  const note = useStore((state) => state.notesById.get(noteId) ?? null);
  const isActive = useStore((state) => state.selectedNoteId === noteId);
  const confirmNoteSelection = useStore((state) => state.confirmNoteSelection);
  const confirmCloseNote = useStore((state) => state.confirmCloseNote);

  const queueNoteSelection = useCallback(() => {
    startTransition(() => {
      confirmNoteSelection(noteId);
    });
  }, [confirmNoteSelection, noteId]);

  if (!note) return null;

  return (
    <div
      draggable
      className={cn(
        "group relative flex h-9 max-w-50 min-w-0 flex-1 cursor-grab items-center rounded-t-lg border-x border-t px-3 transition-all active:cursor-grabbing",
        isActive
          ? "bg-background border-border text-foreground z-10"
          : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50",
        isDragging && "opacity-60",
      )}
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, noteId)}
      onDragStart={(event) => onDragStart(event, noteId)}
      onDrop={(event) => onDrop(event, noteId)}
      onClick={(event) => {
        event.stopPropagation();
        queueNoteSelection();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          queueNoteSelection();
        }
      }}
    >
      {dropIndicatorSide === "left" && (
        <div className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
      )}
      <span className="truncate text-xs font-medium flex-1 mr-6">
        {note.title || "Untitled"}
      </span>
      <button
        type="button"
        draggable={false}
        className={cn(
          "absolute right-1.5 p-0.5 rounded-md transition-colors",
          isActive
            ? "hover:bg-muted"
            : "opacity-0 group-hover:opacity-100 hover:bg-muted",
        )}
        onClick={(e) => {
          e.stopPropagation();
          confirmCloseNote(noteId);
        }}
      >
        <X size={14} />
      </button>
      {dropIndicatorSide === "right" && (
        <div className="pointer-events-none absolute inset-y-1 right-0 w-0.5 rounded-full bg-primary" />
      )}
      {isActive && (
        <div className="absolute -bottom-px left-0 right-0 h-px bg-background" />
      )}
    </div>
  );
});

export function NoteTabs() {
  const { openNoteIds } = useStore(
    useShallow((state) => ({
      openNoteIds: state.openNoteIds,
    })),
  );
  const reorderOpenNotes = useStore((state) => state.reorderOpenNotes);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null,
  );
  const [isTrailingDropActive, setIsTrailingDropActive] = useState(false);

  const resetDragState = useCallback(() => {
    setDraggedNoteId(null);
    setDropIndicator(null);
    setIsTrailingDropActive(false);
  }, []);

  const getDropIndicator = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string): DropIndicator => {
      const rect = event.currentTarget.getBoundingClientRect();
      const side =
        event.clientX - rect.left < rect.width / 2 ? "left" : "right";
      return { noteId, side };
    },
    [],
  );

  const resolveInsertIndex = useCallback(
    (indicator: DropIndicator) => {
      const hoverIndex = openNoteIds.indexOf(indicator.noteId);
      if (hoverIndex === -1) return -1;
      return indicator.side === "left" ? hoverIndex : hoverIndex + 1;
    },
    [openNoteIds],
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", noteId);
      setDraggedNoteId(noteId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string) => {
      if (!draggedNoteId) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropIndicator(getDropIndicator(event, noteId));
      setIsTrailingDropActive(false);
    },
    [draggedNoteId, getDropIndicator],
  );

  const handleTrailingDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggedNoteId) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropIndicator(null);
      setIsTrailingDropActive(true);
    },
    [draggedNoteId],
  );

  const handleTrailingDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (!draggedNoteId) {
        resetDragState();
        return;
      }

      const fromIndex = openNoteIds.indexOf(draggedNoteId);
      const lastIndex = openNoteIds.length - 1;

      if (fromIndex !== -1 && fromIndex !== lastIndex) {
        reorderOpenNotes(fromIndex, lastIndex);
      }

      resetDragState();
    },
    [draggedNoteId, openNoteIds, reorderOpenNotes, resetDragState],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, noteId: string) => {
      event.preventDefault();

      if (!draggedNoteId) {
        resetDragState();
        return;
      }

      const indicator = getDropIndicator(event, noteId);
      const fromIndex = openNoteIds.indexOf(draggedNoteId);
      const rawInsertIndex = resolveInsertIndex(indicator);

      if (fromIndex === -1 || rawInsertIndex === -1) {
        resetDragState();
        return;
      }

      const adjustedInsertIndex =
        rawInsertIndex > fromIndex ? rawInsertIndex - 1 : rawInsertIndex;

      if (adjustedInsertIndex !== fromIndex) {
        reorderOpenNotes(fromIndex, adjustedInsertIndex);
      }

      resetDragState();
    },
    [
      draggedNoteId,
      getDropIndicator,
      openNoteIds,
      reorderOpenNotes,
      resetDragState,
      resolveInsertIndex,
    ],
  );

  if (openNoteIds.length === 0) return null;

  return (
    <div className="flex w-full overflow-hidden bg-background/50">
      <div className="flex w-full h-10 items-end gap-1 border-b border-border pl-10 pr-2">
        {openNoteIds.map((id) => {
          return (
            <NoteTab
              key={id}
              noteId={id}
              isDragging={draggedNoteId === id}
              dropIndicatorSide={
                dropIndicator?.noteId === id ? dropIndicator.side : null
              }
              onDragEnd={resetDragState}
              onDragOver={handleDragOver}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          );
        })}
        {/* Trailing drop zone for dragging tabs to the end */}
        {draggedNoteId && (
          <div
            role="tab"
            tabIndex={-1}
            aria-hidden="true"
            className={cn(
              "relative flex h-9 min-w-16 flex-1 items-center justify-center rounded-t-lg border border-dashed transition-colors",
              isTrailingDropActive
                ? "border-primary bg-primary/10"
                : "border-primary/40 bg-primary/5",
            )}
            onDragOver={handleTrailingDragOver}
            onDragLeave={() => setIsTrailingDropActive(false)}
            onDrop={handleTrailingDrop}
          >
            <div className="pointer-events-none flex items-center gap-1.5 opacity-70">
              <div className="h-3 w-0.5 rounded-full bg-primary/80" />
              <div className="h-1.5 w-6 rounded-full bg-primary/50" />
            </div>
            {isTrailingDropActive && (
              <div className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
