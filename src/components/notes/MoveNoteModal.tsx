import { useStore } from "@/store/useStore";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Folder, Search, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface MoveNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  currentDirectoryId: string | null;
}

/**
 * Modal component for moving a note to a different folder.
 */
export const MoveNoteModal: React.FC<MoveNoteModalProps> = React.memo(
  function MoveNoteModal({ isOpen, onClose, noteId, currentDirectoryId }) {
    const { t } = useTranslation();
    const directories = useStore((state) => state.directories);
    const moveNote = useStore((state) => state.moveNote);
    const [searchQuery, setSearchQuery] = useState("");
    const parentRef = useRef<HTMLDivElement>(null);

    // Optimized: Use a Map for O(1) lookups instead of O(N) array.find in recursion
    const allDirectoryPaths = useMemo(() => {
      const dirMap = new Map(directories.map((d) => [d.id, d]));
      const pathCache = new Map<string, string[]>();

      const getCachedPath = (dirId: string): string[] => {
        if (pathCache.has(dirId)) return pathCache.get(dirId)!;

        const dir = dirMap.get(dirId);
        if (!dir) return [];

        let path: string[];
        if (!dir.parentId) {
          path = [dir.name];
        } else {
          path = [...getCachedPath(dir.parentId), dir.name];
        }

        pathCache.set(dirId, path);
        return path;
      };

      const paths = directories
        .map((d) => ({
          id: d.id,
          path: getCachedPath(d.id),
        }))
        .filter(
          (p) =>
            !(p.path.length === 1 && p.path[0] === t("common.uncategorized")),
        )
        .sort((a, b) => a.path.join(" / ").localeCompare(b.path.join(" / ")));

      // Add "Uncategorized" as an option
      return [{ id: null, path: [t("common.uncategorized")] }, ...paths];
    }, [directories, t]);

    const filteredPaths = useMemo(() => {
      if (!searchQuery.trim()) return allDirectoryPaths;
      const query = searchQuery.toLowerCase();
      return allDirectoryPaths.filter((p) =>
        p.path.join(" / ").toLowerCase().includes(query),
      );
    }, [allDirectoryPaths, searchQuery]);

    // Virtualizer for performance with large lists
    const virtualizer = useVirtualizer({
      count: filteredPaths.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 56, // Approx height of a row (p-3 + content)
      overscan: 5,
    });

    // Reset scroll when search changes
    useEffect(() => {
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
      }
    }, [searchQuery]);

    if (!isOpen) return null;

    const handleSelect = (dirId: string | null) => {
      moveNote(noteId, dirId);
      onClose();
    };

    return createPortal(
      <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
        <div
          className="flex max-h-[80vh] w-full max-w-xl animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
            <h3 className="text-lg font-semibold text-foreground">
              {t("note.moveNote")}
            </h3>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>

          <div className="shrink-0 p-4">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                size={18}
              />
              <input
                autoFocus
                type="text"
                placeholder={t("note.searchDirectories")}
                className="w-full rounded-xl border-none bg-muted py-2 pr-4 pl-10 text-foreground transition-all outline-none focus:ring-2 focus:ring-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredPaths.length > 0 ? (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const dir = filteredPaths[virtualItem.index];
                  const isSelected = dir.id === currentDirectoryId;
                  const isUncategorized = dir.id === null;

                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                        paddingBottom: "4px", // Gap between items
                      }}
                    >
                      <button
                        onClick={() => handleSelect(dir.id as string | null)}
                        disabled={isSelected}
                        className={`flex h-full w-full items-center justify-between rounded-xl p-3 text-left transition-colors ${
                          isSelected
                            ? "cursor-default bg-primary/10 text-primary"
                            : isUncategorized && virtualItem.index === 0
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "text-foreground/80 hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <div className="flex min-w-0 items-center">
                          <Folder
                            size={18}
                            className={`mr-3 shrink-0 ${isSelected ? "text-accent-foreground" : "text-muted-foreground"}`}
                          />
                          <div className="flex flex-wrap items-center truncate text-sm font-medium">
                            {dir.path.map((segment, i) => (
                              <React.Fragment key={i}>
                                <span className="truncate">{segment}</span>
                                {i < dir.path.length - 1 && (
                                  <ChevronRight
                                    size={20}
                                    className="mx-1 shrink-0 text-muted-foreground/30"
                                  />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="ml-2 shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
                            {t("common.current")}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
                <Folder size={48} className="mb-4 text-muted" />
                <p>{t("note.noDirectoriesFound")}</p>
              </div>
            )}
          </div>
        </div>
        <div className="absolute inset-0 -z-10" onClick={onClose} />
      </div>,
      document.body,
    );
  },
);
