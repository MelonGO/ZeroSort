import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";

import { FileText } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NoteMentionPopoverProps {
  filter: string;
  onSelect: (noteId: string, title: string) => void;
  selectedNoteIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NoteMentionPopover: React.FC<NoteMentionPopoverProps> = ({
  filter,
  onSelect,
  selectedNoteIds,
}) => {
  const { t } = useTranslation();
  const openNoteIds = useStore((state) => state.openNoteIds);
  const notesById = useStore((state) => state.notesById);

  const openNotes = useMemo(() => {
    return openNoteIds
      .map((id) => notesById.get(id))
      .filter(
        (n): n is NonNullable<typeof n> =>
          n != null && n.title.toLowerCase().includes(filter.toLowerCase()),
      );
  }, [openNoteIds, notesById, filter]);

  if (openNotes.length === 0) {
    return (
      <div className="rounded-lg border bg-popover p-3 text-center text-xs text-muted-foreground shadow-lg">
        {filter ? t("askAi.noMatchingNotes") : t("askAi.noOpenNotes")}
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg">
      {openNotes.map((note) => (
        <button
          key={note.id}
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
            selectedNoteIds.has(note.id) && "bg-accent/50",
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(note.id, note.title);
          }}
        >
          <FileText size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{note.title}</span>
          {selectedNoteIds.has(note.id) && (
            <span className="ml-auto text-xs text-muted-foreground">✓</span>
          )}
        </button>
      ))}
    </div>
  );
};
