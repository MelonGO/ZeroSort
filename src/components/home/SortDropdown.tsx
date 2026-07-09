import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown, Calendar, Check, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

export type SortByValue = "createdAt" | "updatedAt";

interface SortDropdownProps {
  value: SortByValue;
  onChange: (value: SortByValue) => void;
}

/**
 * Dropdown menu for selecting the sort order of notes.
 * Options: Created At (createdAt) or Updated At (updatedAt).
 */
export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("common.sortBy")}
            >
              <ArrowUpDown size={16} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("common.sortBy")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-48 rounded-2xl border p-2 shadow-xl"
      >
        <DropdownMenuItem
          onClick={() => onChange("createdAt")}
          className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 transition-colors"
        >
          <div className="flex items-center">
            <Calendar size={14} className="mr-2" />
            <span className="text-sm font-medium">{t("common.createdAt")}</span>
          </div>
          {value === "createdAt" && (
            <Check size={14} className="text-primary" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange("updatedAt")}
          className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 transition-colors focus:bg-muted"
        >
          <div className="flex items-center text-foreground">
            <Clock size={14} className="mr-2" />
            <span className="text-sm font-medium">{t("common.updatedAt")}</span>
          </div>
          {value === "updatedAt" && (
            <Check size={14} className="text-primary" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
