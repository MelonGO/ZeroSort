import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useStore } from "@/store/useStore";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface TagPickerProps {
  tagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
}

/** Popover-style tag picker for assigning tags to a note. */
export function TagPicker({ tagIds, onTagsChange }: TagPickerProps) {
  const { t } = useTranslation();
  const tags = useStore((state) => state.tags);
  const addTag = useStore((state) => state.addTag);
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const filteredTags = useMemo(() => {
    if (!search.trim()) return tags;
    const query = search.toLowerCase();
    return tags.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [tags, search]);

  const selectedSet = useMemo(() => new Set(tagIds), [tagIds]);

  const handleToggleTag = useCallback(
    (tagId: string) => {
      const newIds = selectedSet.has(tagId)
        ? tagIds.filter((id) => id !== tagId)
        : [...tagIds, tagId];
      onTagsChange(newIds);
    },
    [tagIds, selectedSet, onTagsChange],
  );

  const handleCreateTag = useCallback(async () => {
    const name = search.trim();
    if (!name) return;

    // Check if tag already exists
    const existing = tags.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      if (!selectedSet.has(existing.id)) {
        onTagsChange([...tagIds, existing.id]);
      }
    } else {
      const createdTag = await addTag(name);
      if (createdTag) {
        onTagsChange([...tagIds, createdTag.id]);
      }
    }
    setSearch("");
  }, [search, tags, selectedSet, tagIds, onTagsChange, addTag]);

  const showCreateOption =
    search.trim() &&
    !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const virtualItemCount = filteredTags.length + (showCreateOption ? 1 : 0);

  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const virtualizer = useVirtualizer({
    count: virtualItemCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => 30,
    overscan: 5,
  });

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus size={12} />
          {t("common.add")} {t("common.tags")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="relative mb-2">
          <Search
            size={14}
            className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && showCreateOption) {
                e.preventDefault();
                void handleCreateTag();
              }
              if (e.key === "Escape") {
                setIsOpen(false);
              }
            }}
            placeholder={`${t("common.tags")}...`}
            className="h-8 py-1 pr-2 pl-7 text-xs"
            autoFocus
          />
        </div>

        <div ref={setScrollElement} className="max-h-40 overflow-y-auto">
          {filteredTags.length === 0 && !showCreateOption ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              {t("common.tags")}
            </p>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const isCreateOption =
                  virtualItem.index === filteredTags.length;

                if (isCreateOption) {
                  return (
                    <button
                      key="__create__"
                      type="button"
                      onClick={() => {
                        void handleCreateTag();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-primary transition-colors hover:bg-primary/5"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <Plus size={12} />
                      <span>
                        {t("common.add")} &quot;{search.trim()}&quot;
                      </span>
                    </button>
                  );
                }

                const tag = filteredTags[virtualItem.index];
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <span
                      className={`flex size-3.5 items-center justify-center rounded border ${
                        selectedSet.has(tag.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {selectedSet.has(tag.id) && (
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="none"
                          className="text-current"
                        >
                          <path
                            d="M1 4L3 6L7 2"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    {tag.color && (
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                    )}
                    <span className="truncate">{tag.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
