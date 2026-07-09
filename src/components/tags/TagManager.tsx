import { TagColorPicker } from "@/components/tags/TagColorPicker";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { Tag } from "@/types";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import {
  CalendarIcon,
  Check,
  Edit2,
  Filter,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  tagNoteCounts: Map<string, number>;
}

/** Modal for tag management: filtering and CRUD operations. */
export function TagManager({
  isOpen,
  onClose,
  tagNoteCounts,
}: TagManagerProps) {
  const { t } = useTranslation();

  const { tags, selectedTagIds, tagFilterMode, selectedDate } = useStore(
    useShallow((state) => ({
      tags: state.tags,
      selectedTagIds: state.selectedTagIds,
      tagFilterMode: state.tagFilterMode,
      selectedDate: state.selectedDate,
    })),
  );

  const addTag = useStore((state) => state.addTag);
  const updateTag = useStore((state) => state.updateTag);
  const deleteTag = useStore((state) => state.deleteTag);
  const deleteTags = useStore((state) => state.deleteTags);
  const toggleTagFilter = useStore((state) => state.toggleTagFilter);
  const clearTagFilters = useStore((state) => state.clearTagFilters);
  const setTagFilterMode = useStore((state) => state.setTagFilterMode);

  const [searchQuery, setSearchQuery] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [colorPickerTagId, setColorPickerTagId] = useState<string | null>(null);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedDeleteTagIds, setSelectedDeleteTagIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isConfirmingBulkDelete, setIsConfirmingBulkDelete] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearchQuery]);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  const dateFilteredTags = useMemo(() => {
    if (!selectedDate) return tags;
    return tags.filter((tag) => tagNoteCounts.has(tag.id));
  }, [tags, selectedDate, tagNoteCounts]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return dateFilteredTags;
    const query = searchQuery.toLowerCase();
    return dateFilteredTags.filter((tag) =>
      tag.name.toLowerCase().includes(query),
    );
  }, [dateFilteredTags, searchQuery]);

  const areAllVisibleDeleteTagsSelected = useMemo(
    () =>
      filteredTags.length > 0 &&
      filteredTags.every((tag) => selectedDeleteTagIds.has(tag.id)),
    [filteredTags, selectedDeleteTagIds],
  );

  const [tagListElement, setTagListElement] = useState<HTMLDivElement | null>(
    null,
  );

  const virtualizer = useVirtualizer({
    count: filteredTags.length,
    getScrollElement: () => tagListElement,
    getItemKey: (index) => filteredTags[index]?.id ?? index,
    estimateSize: () => 48,
    overscan: 5,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, filteredTags.length]);

  useEffect(() => {
    if (selectedDeleteTagIds.size === 0) {
      setIsConfirmingBulkDelete(false);
    }
  }, [selectedDeleteTagIds]);

  const resetBulkDeleteState = useCallback(() => {
    setIsBulkDeleteMode(false);
    setSelectedDeleteTagIds(new Set());
    setIsConfirmingBulkDelete(false);
  }, []);

  const handleClose = useCallback(() => {
    resetBulkDeleteState();
    onClose();
  }, [onClose, resetBulkDeleteState]);

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      await addTag(name);
      setNewTagName("");
    } catch {
      // addTag already shows a toast on error
    }
  }, [newTagName, addTag]);

  const handleStartEdit = useCallback(
    (tag: Tag) => {
      resetBulkDeleteState();
      setDeletingTagId(null);
      setColorPickerTagId(null);
      setEditingTagId(tag.id);
      setEditingName(tag.name);
    },
    [resetBulkDeleteState],
  );

  const handleSaveEdit = useCallback(async () => {
    if (!editingTagId) return;
    const name = editingName.trim();
    if (!name) return;

    try {
      await updateTag(editingTagId, { name });
      setEditingTagId(null);
      setEditingName("");
    } catch {
      toast.error(t("tags.rename") + " failed");
    }
  }, [editingTagId, editingName, updateTag, t]);

  const handleCancelEdit = useCallback(() => {
    setEditingTagId(null);
    setEditingName("");
  }, []);

  const handleConfirmDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTag(id);
        setDeletingTagId(null);
      } catch {
        toast.error(t("tags.delete") + " failed");
      }
    },
    [deleteTag, t],
  );

  const handleEnterBulkDeleteMode = useCallback(() => {
    setEditingTagId(null);
    setEditingName("");
    setDeletingTagId(null);
    setColorPickerTagId(null);
    setIsBulkDeleteMode(true);
    setSelectedDeleteTagIds(new Set());
    setIsConfirmingBulkDelete(false);
  }, []);

  const handleToggleDeleteSelection = useCallback((tagId: string) => {
    setSelectedDeleteTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisibleForDelete = useCallback(() => {
    setSelectedDeleteTagIds((current) => {
      const next = new Set(current);
      filteredTags.forEach((tag) => next.add(tag.id));
      return next;
    });
  }, [filteredTags]);

  const handleClearDeleteSelection = useCallback(() => {
    setSelectedDeleteTagIds(new Set());
    setIsConfirmingBulkDelete(false);
  }, []);

  const handleConfirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedDeleteTagIds);
    if (ids.length === 0) return;

    try {
      await deleteTags(ids);
      resetBulkDeleteState();
    } catch {
      toast.error(t("tags.delete") + " failed");
    }
  }, [deleteTags, resetBulkDeleteState, selectedDeleteTagIds, t]);

  const handleColorChange = useCallback(
    async (tagId: string, color: string | null) => {
      try {
        await updateTag(tagId, { color });
      } catch {
        toast.error(t("tags.color") + " update failed");
      }
    },
    [updateTag, t],
  );

  const handleSetMatchAny = useCallback(() => {
    setTagFilterMode("or");
  }, [setTagFilterMode]);

  const handleSetMatchAll = useCallback(() => {
    setTagFilterMode("and");
  }, [setTagFilterMode]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="animate-in fade-in fixed inset-0 z-100 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200"
      onClick={handleClose}
    >
      <div
        className="animate-in zoom-in-95 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-2xl duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-bold tracking-tight">
            {t("tags.title")}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5">
          <div className="flex min-h-0 flex-1 flex-col space-y-6">
            {/* Date Filter Indicator */}
            {selectedDate && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <CalendarIcon size={14} className="shrink-0 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {t("tags.dateFilter", { date: format(selectedDate, "PPP") })}
                </span>
              </div>
            )}

            {/* Active Filters Section */}
            {selectedTagIds.size > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter size={16} className="text-primary" />
                    <h2 className="text-sm font-semibold">
                      {t("tags.filters")}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5">
                      <button
                        type="button"
                        onClick={handleSetMatchAny}
                        className={cn(
                          "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors",
                          tagFilterMode === "or"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t("sidebar.matchAny")}
                      </button>
                      <button
                        type="button"
                        onClick={handleSetMatchAll}
                        className={cn(
                          "rounded-sm px-2 py-0.5 text-xs font-medium transition-colors",
                          tagFilterMode === "and"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t("sidebar.matchAll")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={clearTagFilters}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      {t("sidebar.clearTagFilters")}
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags
                    .filter((tag) => selectedTagIds.has(tag.id))
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTagFilter(tag.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        {tag.color && (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        {tag.name}
                        <X size={12} />
                      </button>
                    ))}
                </div>
              </section>
            )}

            {/* Create Tag */}
            <section>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Plus
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreateTag();
                      }
                    }}
                    placeholder={t("tags.namePlaceholder")}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateTag()}
                  disabled={!newTagName.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {t("tags.create")}
                </button>
              </div>
            </section>

            {/* Tag List */}
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <h2 className="text-sm font-semibold">{t("tags.allTags")}</h2>
                <div className="flex items-center gap-2">
                  {tags.length > 5 && (
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        type="text"
                        value={localSearchQuery}
                        onChange={(e) => setLocalSearchQuery(e.target.value)}
                        placeholder={t("tags.searchPlaceholder")}
                        className="rounded-md border border-border bg-background py-1 pl-8 pr-3 text-xs outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </div>
                  )}
                  {tags.length > 0 &&
                    (isBulkDeleteMode ? (
                      <button
                        type="button"
                        onClick={resetBulkDeleteState}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {t("tags.cancelSelection")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleEnterBulkDeleteMode}
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        {t("tags.selectMultiple")}
                      </button>
                    ))}
                </div>
              </div>

              {isBulkDeleteMode && (
                <div className="mb-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">
                      {t("tags.selectedCount", {
                        count: selectedDeleteTagIds.size,
                      })}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllVisibleForDelete}
                        disabled={
                          filteredTags.length === 0 ||
                          areAllVisibleDeleteTagsSelected
                        }
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {t("tags.selectAll")}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearDeleteSelection}
                        disabled={selectedDeleteTagIds.size === 0}
                        className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {t("tags.clearSelection")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingBulkDelete(true)}
                        disabled={selectedDeleteTagIds.size === 0}
                        className="rounded-md px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                      >
                        {t("tags.deleteSelected")}
                      </button>
                    </div>
                  </div>

                  {isConfirmingBulkDelete && selectedDeleteTagIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-xs text-destructive">
                        {t("tags.deleteSelectedConfirm", {
                          count: selectedDeleteTagIds.size,
                        })}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleConfirmBulkDelete()}
                        className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        {t("tags.delete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingBulkDelete(false)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {filteredTags.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-12 text-center">
                  <TagIcon
                    size={32}
                    className="mx-auto mb-3 text-muted-foreground/40"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("tags.noTags")}
                  </p>
                </div>
              ) : (
                <div
                  ref={setTagListElement}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                      const tag = filteredTags[virtualItem.index];
                      const isActive = selectedTagIds.has(tag.id);
                      const isDeleteSelected = selectedDeleteTagIds.has(tag.id);
                      const count = tagNoteCounts.get(tag.id) || 0;
                      const isEditing = editingTagId === tag.id;
                      const isDeleting = deletingTagId === tag.id;
                      const showColorPicker = colorPickerTagId === tag.id;

                      return (
                        <div
                          key={tag.id}
                          data-index={virtualItem.index}
                          ref={virtualizer.measureElement}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <div
                            className={cn(
                              "group rounded-lg border border-transparent p-3 transition-colors",
                              isActive
                                ? "border-primary/20 bg-primary/5"
                                : "hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              {/* Filter toggle */}
                              <button
                                type="button"
                                onClick={() =>
                                  isBulkDeleteMode
                                    ? handleToggleDeleteSelection(tag.id)
                                    : toggleTagFilter(tag.id)
                                }
                                className={cn(
                                  "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                                  isBulkDeleteMode
                                    ? isDeleteSelected
                                      ? "border-destructive bg-destructive text-destructive-foreground"
                                      : "border-muted-foreground/30 hover:border-destructive/50"
                                    : isActive
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-muted-foreground/30 hover:border-primary/50",
                                )}
                              >
                                {((isBulkDeleteMode && isDeleteSelected) ||
                                  (!isBulkDeleteMode && isActive)) && (
                                  <Check size={12} />
                                )}
                              </button>

                              {/* Color dot */}
                              <button
                                type="button"
                                disabled={isBulkDeleteMode}
                                onClick={() =>
                                  setColorPickerTagId(
                                    showColorPicker ? null : tag.id,
                                  )
                                }
                                className="shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                                title={t("tags.color")}
                              >
                                <span
                                  className={cn(
                                    "block size-3 rounded-full border",
                                    tag.color
                                      ? "border-transparent"
                                      : "border-muted-foreground/30 bg-muted",
                                  )}
                                  style={
                                    tag.color
                                      ? { backgroundColor: tag.color }
                                      : undefined
                                  }
                                />
                              </button>

                              {/* Name (editable) */}
                              {isEditing ? (
                                <div className="flex flex-1 items-center gap-1">
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) =>
                                      setEditingName(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        void handleSaveEdit();
                                      }
                                      if (e.key === "Escape")
                                        handleCancelEdit();
                                    }}
                                    className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-primary/20"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveEdit()}
                                    className="rounded p-1 text-primary hover:bg-primary/10"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <span className="flex-1 truncate text-sm font-medium">
                                  {tag.name}
                                </span>
                              )}

                              {/* Note count */}
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {t("tags.noteCount", { count })}
                              </span>

                              {/* Actions */}
                              {!isBulkDeleteMode &&
                                !isEditing &&
                                !isDeleting && (
                                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(tag)}
                                      title={t("tags.rename")}
                                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingTagId(tag.id)}
                                      title={t("tags.delete")}
                                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                            </div>

                            {/* Color Picker */}
                            {showColorPicker && (
                              <div className="mt-2 pl-8">
                                <TagColorPicker
                                  value={tag.color}
                                  onChange={(color) => {
                                    void handleColorChange(tag.id, color);
                                    setColorPickerTagId(null);
                                  }}
                                />
                              </div>
                            )}

                            {/* Delete Confirmation */}
                            {isDeleting && !isBulkDeleteMode && (
                              <div className="mt-2 flex items-center gap-2 pl-8">
                                <p className="flex-1 text-xs text-destructive">
                                  {t("tags.deleteConfirm")}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleConfirmDelete(tag.id)
                                  }
                                  className="rounded px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                                >
                                  {t("tags.delete")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingTagId(null)}
                                  className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
