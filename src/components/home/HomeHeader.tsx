import { ZeroSortIcon } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/store/useStore";
import { CheckSquare, Sparkles, Tag, XIcon } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { DatePicker } from "./DatePicker";
import { SortDropdown, type SortByValue } from "./SortDropdown";

interface HomeHeaderProps {
  sortBy: SortByValue;
  onSortChange: (value: SortByValue) => void;
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
  noteCountsByDate: Map<string, number>;
  isMultiSelectMode: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleMultiSelect: () => void;
  onBatchRegenerate: () => void;
  onOpenTagManager: () => void;
}

/**
 * Header component for the home page.
 * Displays the ZeroSort logo, tagline, view mode toggle, sort dropdown, and multi-select toolbar.
 */
function HomeHeaderComponent({
  sortBy,
  onSortChange,
  selectedDate,
  onDateChange,
  noteCountsByDate,
  isMultiSelectMode,
  selectedCount,
  totalCount,
  onToggleMultiSelect,
  onBatchRegenerate,
  onOpenTagManager,
}: HomeHeaderProps) {
  const { t } = useTranslation();
  const selectedTagIds = useStore((state) => state.selectedTagIds);

  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4 p-4">
      <div className="space-y-1">
        <ZeroSortIcon className="-mr-1 h-14 w-14 dark:invert" />
        <p className="text-muted-foreground italic">{t("home.tagline")}</p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <DatePicker
                  date={selectedDate}
                  onDateChange={onDateChange}
                  noteCountsByDate={noteCountsByDate}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("common.datePicker.pickDate")}
            </TooltipContent>
          </Tooltip>

          <SortDropdown value={sortBy} onChange={onSortChange} />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenTagManager}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("sidebar.manageTags")}
              >
                <Tag size={16} />
                {selectedTagIds.size > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {selectedTagIds.size}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("sidebar.manageTags")}
            </TooltipContent>
          </Tooltip>

          {isMultiSelectMode ? (
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onBatchRegenerate}
                    disabled={selectedCount === 0}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                    aria-label={t("batch.regenerateTooltip")}
                  >
                    <Sparkles size={16} />
                    <span>{t("note.sort")}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("batch.regenerateTooltip")}
                  {selectedCount > 0 && (
                    <span className="ml-1 opacity-70">({selectedCount})</span>
                  )}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onToggleMultiSelect}
                    aria-label={t("common.datePicker.clearFilter")}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("common.cancel")}
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleMultiSelect}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("batch.multiSelect")}
                >
                  <CheckSquare size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("batch.multiSelect")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </header>
  );
}

export const HomeHeader = memo(HomeHeaderComponent);
HomeHeader.displayName = "HomeHeader";
