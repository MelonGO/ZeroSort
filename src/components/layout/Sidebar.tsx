import {
  FolderActionModal,
  type FolderActionType,
} from "@/components/notes/FolderActionModal";
import { cn } from "@/lib/utils";
import {
  createSidebarTreeIndex,
  type SidebarTreeIndex,
} from "@/lib/virtualization/sidebarTreeIndex";
import { useStore } from "@/store/useStore";
import type { FolderNode } from "@/types";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit2,
  FileText,
  Folder,
  Move,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

interface SidebarFolderRowProps {
  node: FolderNode;
  level: number;
  path: string;
  onAction: (type: FolderActionType, node: FolderNode) => void;
}

interface VirtualizedListProps {
  treeIndex: SidebarTreeIndex;
  selectedNoteId: string | null;
  onAction: (type: FolderActionType, node: FolderNode) => void;
}

const sidebarLoadingRows = [
  { level: 0, width: "6.5rem", type: "folder" },
  { level: 1, width: "5rem", type: "note" },
  { level: 0, width: "7.5rem", type: "folder" },
  { level: 1, width: "4.5rem", type: "note" },
  { level: 1, width: "5.5rem", type: "note" },
] as const;

const SidebarFolderRow = React.memo<SidebarFolderRowProps>(
  ({ node, level, path, onAction }) => {
    const { t } = useTranslation();
    const togglePath = useStore((state) => state.togglePath);
    const showFolderNoteCount = useStore((state) => state.showFolderNoteCount);

    const isOpen = useStore((state) => state.expandedPaths.has(path));

    const handleAddSubfolder = (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction("add", node);
    };

    const handleRename = (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction("rename", node);
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction("delete", node);
    };

    const handleMove = (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction("move", node);
    };

    return (
      <div
        role="none"
        className="group flex w-fit min-w-full items-center rounded-md py-1 pr-8 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-primary"
        style={{ paddingLeft: `${level * 0.5 + 0.5}rem` }}
        title={node.name}
      >
        <button
          type="button"
          onClick={() => togglePath(path)}
          className="flex min-w-0 flex-1 items-center"
        >
          {Object.keys(node.children).length > 0 || node.noteIds.length > 0 ? (
            isOpen ? (
              <ChevronDown size={20} className="mr-1 shrink-0" />
            ) : (
              <ChevronRight size={20} className="mr-1 shrink-0" />
            )
          ) : (
            <div className="mr-1 w-5 shrink-0" />
          )}
          <Folder size={20} className="text-sidebar-muted mr-2 shrink-0" />
          <span className="text-sm font-medium whitespace-nowrap">
            {node.name}
          </span>
          {showFolderNoteCount && node.noteIds.length > 0 && (
            <span className="text-sidebar-muted ml-2 rounded-full bg-sidebar-accent/20 px-1.5 py-0.5 text-xs">
              {node.noteIds.length}
            </span>
          )}
        </button>

        {node.id && (
          <div className="invisible ml-1 flex shrink-0 items-center space-x-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
            <button
              type="button"
              onClick={handleAddSubfolder}
              title={t("folder.addSubfolder")}
              className="rounded p-0.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-primary"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              onClick={handleRename}
              title={t("folder.rename")}
              className="rounded p-0.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-primary"
            >
              <Edit2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleMove}
              title={t("folder.moveFolder") || "Move"}
              className="rounded p-0.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-primary"
            >
              <Move size={16} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              title={t("folder.delete")}
              className="rounded p-0.5 transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    );
  },
);

const SidebarNoteRow = React.memo<{ noteId: string; level: number }>(
  ({ noteId, level }) => {
    const note = useStore((state) => state.notesById.get(noteId));
    const confirmNoteSelection = useStore(
      (state) => state.confirmNoteSelection,
    );
    const isSelected = useStore((state) => state.selectedNoteId === noteId);

    if (!note) return null;

    return (
      <button
        type="button"
        onClick={() => confirmNoteSelection(note.id)}
        className={cn(
          "flex w-fit min-w-full items-center rounded-md py-1 pr-8 transition-colors",
          isSelected
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/5 hover:text-sidebar-foreground",
        )}
        style={{ paddingLeft: `${level * 0.5 + 1.5}rem` }}
        title={note.title}
      >
        <FileText
          size={20}
          className={cn(
            "mr-2 shrink-0",
            isSelected && "text-sidebar-primary-foreground",
          )}
        />
        <span
          className={cn(
            "text-xs whitespace-nowrap",
            isSelected && "font-medium",
          )}
        >
          {note.title}
        </span>
      </button>
    );
  },
);

const VirtualizedList = React.memo<VirtualizedListProps>(
  ({ treeIndex, selectedNoteId, onAction }) => {
    const { t } = useTranslation();
    const parentRef = useRef<HTMLDivElement>(null);
    const lastScrolledNoteId = useRef<string | null>(null);

    const virtualizer = useVirtualizer({
      count: treeIndex.count,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 32,
      overscan: 10,
    });

    useLayoutEffect(() => {
      if (selectedNoteId) {
        if (selectedNoteId !== lastScrolledNoteId.current) {
          const index = treeIndex.findNoteIndex(selectedNoteId);

          if (index >= 0) {
            virtualizer.scrollToIndex(index, {
              align: "center",
              behavior: "instant",
            });
            lastScrolledNoteId.current = selectedNoteId;
          }
        }
      } else {
        lastScrolledNoteId.current = null;
      }
    }, [selectedNoteId, treeIndex, virtualizer]);

    return (
      <div
        ref={parentRef}
        className="min-w-full flex-1 overflow-x-auto overflow-y-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            minWidth: "max-content",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = treeIndex.getItem(virtualItem.index);
            if (!item) {
              return null;
            }

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  minWidth: "max-content",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.type === "header" && (
                  <div className="mb-2 flex items-center justify-between px-2">
                    <span className="text-xs font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                      {t("sidebar.folders")}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAction("add", item.node)}
                      className="rounded p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-accent"
                      title={t("folder.newFolder")}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                )}
                {item.type === "folder" && (
                  <SidebarFolderRow
                    node={item.node}
                    level={item.level}
                    path={item.path}
                    onAction={onAction}
                  />
                )}
                {item.type === "note" && (
                  <SidebarNoteRow noteId={item.noteId} level={item.level} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

VirtualizedList.displayName = "VirtualizedList";

function SidebarLoadingState() {
  const { t } = useTranslation();

  return (
    <div
      aria-busy="true"
      aria-label={t("common.loading")}
      className="flex min-w-full flex-1 flex-col overflow-hidden px-2"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
          {t("sidebar.folders")}
        </span>
        <div className="h-7 w-7 animate-pulse rounded-md bg-sidebar-accent/20" />
      </div>

      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-sidebar-primary/40" />
        <span className="text-xs text-sidebar-foreground/50">
          {t("common.loading")}
        </span>
      </div>

      <div className="space-y-2 overflow-hidden">
        {sidebarLoadingRows.map((row, index) => (
          <div
            key={`${row.type}-${index}`}
            className="flex items-center rounded-md py-1 pr-8"
            style={{ paddingLeft: `${row.level * 0.5 + 0.5}rem` }}
          >
            <div
              className={cn(
                "mr-2 animate-pulse rounded bg-sidebar-accent/20",
                row.type === "folder" ? "h-4 w-4" : "ml-5 h-3.5 w-3.5",
              )}
            />
            <div
              className="h-3.5 animate-pulse rounded bg-sidebar-accent/20"
              style={{ width: row.width }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarComponent() {
  const { t } = useTranslation();
  const {
    folderTree,
    isInitialized,
    expandedPaths,
    notesById,
    selectedNoteId,
    sortBy,
    searchQuery,
  } = useStore(
    useShallow((state) => ({
      folderTree: state.folderTree,
      isInitialized: state.isInitialized,
      expandedPaths: state.expandedPaths,
      notesById: state.notesById,
      selectedNoteId: state.selectedNoteId,
      sortBy: state.sortBy,
      searchQuery: state.searchQuery,
    })),
  );

  // Actions are referentially stable in Zustand — no shallow comparison needed
  const expandAll = useStore((state) => state.expandAll);
  const collapseAll = useStore((state) => state.collapseAll);
  const addDirectory = useStore((state) => state.addDirectory);
  const updateDirectory = useStore((state) => state.updateDirectory);
  const moveDirectory = useStore((state) => state.moveDirectory);
  const deleteDirectory = useStore((state) => state.deleteDirectory);
  const setSearchQuery = useStore((state) => state.setSearchQuery);

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearchQuery, setSearchQuery]);

  // Sync local search query if global search query changes (e.g. cleared from elsewhere)
  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  const treeIndex = useMemo(() => {
    return createSidebarTreeIndex({
      folderTree,
      expandedPaths,
      sortBy,
      searchQuery,
      notesById,
    });
  }, [folderTree, expandedPaths, notesById, sortBy, searchQuery]);

  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: FolderActionType;
    node: FolderNode | null;
  }>({
    isOpen: false,
    type: "add",
    node: null,
  });

  const handleAction = useCallback(
    (type: FolderActionType, node: FolderNode) => {
      setModalState({
        isOpen: true,
        type,
        node,
      });
    },
    [],
  );

  const handleClose = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleConfirm = useCallback(
    (name?: string | null, deleteNotes?: boolean) => {
      const { type, node } = modalState;
      if (!node) return;

      if (type === "add") {
        if (name) {
          if (node.id) {
            addDirectory(name, node.id);
          } else if (node.name === "root") {
            addDirectory(name, null);
          }
        }
      } else if (type === "rename") {
        if (name && node.id && name !== node.name) {
          updateDirectory(node.id, { name });
        }
      } else if (type === "delete") {
        if (node.id) {
          deleteDirectory(node.id, deleteNotes ?? false);
        }
      } else if (type === "move") {
        if (node.id) {
          // Here 'name' actually contains the destinationId (string | null)
          moveDirectory(node.id, name as string | null);
        }
      }

      handleClose();
    },
    [
      addDirectory,
      deleteDirectory,
      handleClose,
      modalState,
      moveDirectory,
      updateDirectory,
    ],
  );

  return (
    <div className="sidebar-scroll-area group/sidebar flex h-screen w-full flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <div className="mb-4 flex shrink-0 items-center justify-between px-2">
        <h2 className="text-lg font-bold tracking-tight">ZeroSort</h2>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={expandAll}
            disabled={!isInitialized}
            className="rounded p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-accent disabled:cursor-not-allowed disabled:opacity-40"
            title={t("sidebar.expandAll")}
          >
            <ChevronDown size={20} />
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={!isInitialized}
            className="rounded p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-accent disabled:cursor-not-allowed disabled:opacity-40"
            title={t("sidebar.collapseAll")}
          >
            <ChevronUp size={20} />
          </button>
          <Link
            to="/settings"
            className="rounded p-1 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/10 hover:text-sidebar-accent"
            title={t("settings.ai.title")}
          >
            <Settings size={20} />
          </Link>
        </div>
      </div>

      <div className="mb-4 px-2">
        <div className="relative group" role="none">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 transition-colors group-focus-within:text-sidebar-primary"
          />
          <input
            type="text"
            value={localSearchQuery}
            disabled={!isInitialized}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            className="w-full rounded-xl border border-sidebar-border bg-sidebar-accent/5 py-2 pl-10 pr-10 text-sm outline-none transition-all focus:border-sidebar-primary/50 focus:bg-sidebar-accent/10 focus:ring-2 focus:ring-sidebar-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {searchQuery && isInitialized && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {isInitialized ? (
        <VirtualizedList
          treeIndex={treeIndex}
          selectedNoteId={selectedNoteId}
          onAction={handleAction}
        />
      ) : (
        <SidebarLoadingState />
      )}

      <FolderActionModal
        isOpen={modalState.isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        type={modalState.type}
        initialValue={modalState.type === "rename" ? modalState.node?.name : ""}
        folderName={modalState.node?.name}
        folderId={modalState.node?.id}
      />
    </div>
  );
}

export const Sidebar = React.memo(SidebarComponent);
Sidebar.displayName = "Sidebar";
