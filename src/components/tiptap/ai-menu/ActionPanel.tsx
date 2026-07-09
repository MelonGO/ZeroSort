import React from "react";
import { useTranslation } from "react-i18next";

import { ModelSelectDropdown } from "@/components/editor/ModelSelectDropdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { AiActionType } from "@/lib/ai/prompts";
import { cn } from "@/lib/utils";
import { CHART_TYPES } from "@/lib/visualization/chartjs";

import { ArrowUp, Square } from "lucide-react";

import {
  CHART_ITEMS,
  EDIT_ITEMS,
  LANGUAGES,
  type MenuItem,
  SUGGESTED_ITEMS,
  TONES,
} from "./constants";
import { MenuItemRow } from "./MenuItemRow";

// ---------------------------------------------------------------------------
// ActionPanel
// ---------------------------------------------------------------------------

interface ActionPanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  useFullContext: boolean;
  onUseFullContextChange: (checked: boolean) => void;
  showModelSelect: boolean;
  activeSubmenu: "languages" | "tones" | "chartTypes" | null;
  onAiAction: (id: AiActionType, option?: string) => void;
  onSubmenuMouseEnter: (submenuType: MenuItem["submenuType"]) => void;
  onSubmenuMouseLeave: () => void;
  onInterrupt: () => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading,
  useFullContext,
  onUseFullContextChange,
  showModelSelect,
  activeSubmenu,
  onAiAction,
  onSubmenuMouseEnter,
  onSubmenuMouseLeave,
  onInterrupt,
}) => {
  const { t } = useTranslation();

  const renderSubmenuItems = (
    items: readonly string[],
    actionType: AiActionType,
    translationPrefix: string,
    useRawOption?: boolean,
  ) =>
    items.map((item) => (
      <button
        key={item}
        type="button"
        onClick={() =>
          onAiAction(
            actionType,
            useRawOption ? item : t(`${translationPrefix}.${item}`),
          )
        }
        disabled={isLoading}
        className={cn(
          "flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {t(`${translationPrefix}.${item}`)}
      </button>
    ));

  const getSubmenuContent = (item: MenuItem) => {
    if (item.submenuType === "languages")
      return renderSubmenuItems(LANGUAGES, "translate", "aiMenu.languages");
    if (item.submenuType === "tones")
      return renderSubmenuItems(TONES, "tone", "aiMenu.tones");
    if (item.submenuType === "chartTypes")
      return renderSubmenuItems(
        CHART_TYPES,
        "chart",
        "aiMenu.chartTypes",
        true,
      );
    return null;
  };

  const renderMenuItem = (item: MenuItem) => (
    <MenuItemRow
      key={item.id}
      item={{ ...item, labelKey: t(item.labelKey) }}
      isSubmenuActive={activeSubmenu === item.submenuType}
      isLoading={isLoading}
      onMouseEnter={onSubmenuMouseEnter}
      onMouseLeave={onSubmenuMouseLeave}
      onAction={onAiAction}
      submenuContent={getSubmenuContent(item)}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Custom prompt input */}
      <div className="flex shrink-0 items-center gap-2 border-b p-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder={t("aiMenu.placeholder")}
          disabled={isLoading}
          className={cn(
            "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground",
            "disabled:opacity-50",
          )}
        />
        <Button
          type="button"
          variant="default"
          size="icon-xs"
          className="rounded-full"
          onClick={isLoading ? onInterrupt : onSubmit}
          disabled={!isLoading && !prompt.trim()}
          title={isLoading ? t("aiMenu.interrupt") : t("aiMenu.send")}
        >
          {isLoading ? (
            <Square size={12} className="fill-current" />
          ) : (
            <ArrowUp size={14} />
          )}
        </Button>
      </div>

      {/* Options bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="useFullContext"
            checked={useFullContext}
            onCheckedChange={(checked) =>
              onUseFullContextChange(checked === true)
            }
            disabled={isLoading}
          />
          <label
            htmlFor="useFullContext"
            className="cursor-pointer text-xs text-muted-foreground select-none"
          >
            {t("aiMenu.useFullContext")}
          </label>
        </div>
        {showModelSelect && <ModelSelectDropdown />}
      </div>

      {/* Action menu items */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-1")}>
        <div className="px-2 py-1">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("aiMenu.sections.suggested")}
          </span>
        </div>
        {SUGGESTED_ITEMS.map(renderMenuItem)}

        <div className="my-1 h-px bg-border" />

        <div className="px-2 py-1">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("aiMenu.sections.charts")}
          </span>
        </div>
        {CHART_ITEMS.map(renderMenuItem)}

        <div className="my-1 h-px bg-border" />

        <div className="px-2 py-1">
          <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("aiMenu.sections.edit")}
          </span>
        </div>
        {EDIT_ITEMS.map(renderMenuItem)}
      </div>
    </div>
  );
};
