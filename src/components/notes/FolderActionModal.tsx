import { useStore } from "@/store/useStore";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRight,
  Edit3,
  Folder,
  FolderPlus,
  Move,
  Search,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export type FolderActionType = "add" | "rename" | "delete" | "move";

interface FolderActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value?: string | null, deleteNotes?: boolean) => void;
  type: FolderActionType;
  initialValue?: string;
  folderName?: string;
  folderId?: string; // Current folder ID for move validation
}

/**
 * Modal component for performing folder-related actions (add, rename, delete, move).
 */
export const FolderActionModal: React.FC<FolderActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  type,
  initialValue = "",
  folderName = "",
  folderId = "",
}) => {
  const { t } = useTranslation();
  const directories = useStore((state) => state.directories);
  const [value, setValue] = useState(initialValue);
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteNotes, setDeleteNotes] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setSearchQuery("");
      setDeleteNotes(false);

      if (type === "move" && folderId) {
        const currentDir = directories.find((d) => d.id === folderId);
        setSelectedDestId(currentDir?.parentId ?? null);
      } else {
        setSelectedDestId(null);
      }
    }
  }, [isOpen, initialValue, type, folderId, directories]);

  // Optimized: Use a Map for O(1) lookups and path calculation for breadcrumbs
  const allFoldersWithPaths = useMemo(() => {
    const dirMap = new Map(directories.map((d) => [d.id, d]));
    const pathCache = new Map<string, string[]>();

    const getCachedPath = (dirId: string): string[] => {
      if (pathCache.has(dirId)) return pathCache.get(dirId)!;
      const dir = dirMap.get(dirId);
      if (!dir) return [];
      const path = !dir.parentId
        ? [dir.name]
        : [...getCachedPath(dir.parentId), dir.name];
      pathCache.set(dirId, path);
      return path;
    };

    return directories.map((d) => ({
      ...d,
      fullPath: getCachedPath(d.id),
    }));
  }, [directories]);

  // Filter out current folder and its descendants from destination list
  const availableFolders = useMemo(() => {
    if (type !== "move" || !folderId) return [];

    const getDescendantIds = (id: string): string[] => {
      const children = directories.filter((d) => d.parentId === id);
      return [
        ...children.map((c) => c.id),
        ...children.flatMap((c) => getDescendantIds(c.id)),
      ];
    };

    const forbiddenIds = new Set([folderId, ...getDescendantIds(folderId)]);
    const folders = allFoldersWithPaths
      .filter((d) => !forbiddenIds.has(d.id))
      .sort((a, b) =>
        a.fullPath.join(" / ").localeCompare(b.fullPath.join(" / ")),
      );

    // Filter by search query if present
    const query = searchQuery.toLowerCase().trim();
    const filteredFolders = query
      ? folders.filter((f) =>
          f.fullPath.join(" / ").toLowerCase().includes(query),
        )
      : folders;

    // Add Root as the first option if it matches search or if search is empty
    const rootItem = { id: "root", fullPath: [t("folder.root")], isRoot: true };
    const includeRoot =
      !query || t("folder.root").toLowerCase().includes(query);

    return includeRoot ? [rootItem, ...filteredFolders] : filteredFolders;
  }, [allFoldersWithPaths, directories, type, folderId, t, searchQuery]);

  // Virtualizer for performance with large lists
  const virtualizer = useVirtualizer({
    count: availableFolders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // Height of a row
    overscan: 5,
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === "delete") {
      onConfirm(undefined, deleteNotes);
    } else if (type === "move") {
      onConfirm(selectedDestId);
    } else if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const getTitle = () => {
    switch (type) {
      case "add":
        return t("folder.newFolder");
      case "rename":
        return t("folder.renameFolder");
      case "delete":
        return t("folder.deleteFolder");
      case "move":
        return t("folder.moveFolder");
    }
  };

  const getIcon = () => {
    switch (type) {
      case "add":
        return <FolderPlus className="text-primary" size={20} />;
      case "rename":
        return <Edit3 className="text-primary" size={20} />;
      case "delete":
        return <Trash2 className="text-destructive" size={20} />;
      case "move":
        return <Move className="text-primary" size={20} />;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
      <div
        className={`w-full bg-background ${type === "move" ? "h-[80vh] max-w-xl" : "max-w-sm"} flex max-h-[80vh] animate-in flex-col overflow-hidden rounded-2xl shadow-2xl duration-200 zoom-in-95`}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center space-x-2">
            {getIcon()}
            <h3 className="text-lg font-semibold text-foreground">
              {getTitle()}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent"
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col p-6"
        >
          {type === "delete" ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("folder.deleteConfirmation", { name: folderName })}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {t("folder.deleteWarning")}
              </p>
              <div className="space-y-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    !deleteNotes
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="deleteOption"
                    checked={!deleteNotes}
                    onChange={() => setDeleteNotes(false)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {t("folder.deleteOptionMoveToUncategorized")}
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    deleteNotes
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="deleteOption"
                    checked={deleteNotes}
                    onChange={() => setDeleteNotes(true)}
                    className="mt-0.5 accent-destructive"
                  />
                  <span className="text-sm text-foreground">
                    {t("folder.deleteOptionDeleteAll")}
                  </span>
                </label>
              </div>
              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg shadow-destructive/20 transition-all hover:bg-destructive/90 active:scale-[0.98]"
                >
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ) : type === "move" ? (
            <div className="flex min-h-0 flex-1 flex-col space-y-4">
              <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {t("folder.selectDestination")}
              </p>
              <div className="relative">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                  size={14}
                />
                <input
                  type="text"
                  placeholder={t("note.searchDirectories")}
                  className="w-full rounded-xl border-none bg-muted py-2 pr-4 pl-9 text-xs text-foreground transition-all outline-none focus:ring-2 focus:ring-primary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div
                ref={parentRef}
                className="flex-1 overflow-y-auto rounded-xl border border-border bg-muted/30"
              >
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const folder = availableFolders[virtualItem.index];
                    const isRootItem = "isRoot" in folder && folder.isRoot;
                    const isSelected = isRootItem
                      ? selectedDestId === null
                      : selectedDestId === folder.id;

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
                          padding: "4px 8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedDestId(isRootItem ? null : folder.id)
                          }
                          className={`flex w-full items-center rounded-lg p-2 text-sm transition-colors ${isSelected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}
                        >
                          <Folder
                            size={16}
                            className={`mr-2 shrink-0 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`}
                          />
                          <div className="flex flex-wrap items-center truncate text-xs font-medium">
                            {folder.fullPath.map((segment, i) => (
                              <React.Fragment key={i}>
                                <span className="truncate">{segment}</span>
                                {i < folder.fullPath.length - 1 && (
                                  <ChevronRight
                                    size={14}
                                    className={`mx-0.5 shrink-0 ${isSelected ? "text-primary-foreground/70" : "text-border"}`}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
                {availableFolders.length === 0 && (
                  <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
                    <Folder size={48} className="mb-4 text-muted/50" />
                    <p className="text-sm italic">
                      {t("note.noDirectoriesFound")}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  {t("folder.move")}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="folder-name"
                  className="mb-2 block text-xs font-medium tracking-wider text-muted-foreground uppercase"
                >
                  {t("folder.folderName")}
                </label>
                <input
                  id="folder-name"
                  autoFocus
                  type="text"
                  placeholder={t("folder.placeholder")}
                  className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm text-foreground transition-all outline-none focus:ring-2 focus:ring-primary"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!value.trim()}
                  className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {type === "add" ? t("folder.create") : t("folder.rename")}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
      <div className="absolute inset-0 -z-10" />
    </div>,
    document.body,
  );
};
