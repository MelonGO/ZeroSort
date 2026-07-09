import React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Copy, Loader2, MousePointerClick, Square, X } from "lucide-react";

// ---------------------------------------------------------------------------
// PreviewHeader
// ---------------------------------------------------------------------------

interface PreviewHeaderProps {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  isLoading: boolean;
  onClose: () => void;
  onCopy?: () => void;
  onInterrupt?: () => void;
}

/** Shared header bar for all preview views (markmap, chart, text). */
export const PreviewHeader: React.FC<PreviewHeaderProps> = ({
  icon,
  iconColor,
  label,
  isLoading,
  onClose,
  onCopy,
  onInterrupt,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {isLoading ? (
          <>
            <Loader2 size={12} className={cn("animate-spin", iconColor)} />
            {t("aiMenu.generating")}
          </>
        ) : (
          <>
            <span className={iconColor}>{icon}</span>
            {label}
          </>
        )}
      </span>
      {isLoading && onInterrupt ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-full text-muted-foreground"
          onClick={onInterrupt}
          title={t("aiMenu.interrupt")}
        >
          <Square size={12} className="fill-current" />
        </Button>
      ) : !isLoading ? (
        <div className="flex items-center gap-1">
          {onCopy ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-full text-muted-foreground"
              onClick={onCopy}
              title={t("aiMenu.copy")}
            >
              <Copy size={14} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="rounded-full text-muted-foreground"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PreviewFooter
// ---------------------------------------------------------------------------

interface PreviewFooterProps {
  onDiscard: () => void;
  onInsertAtPosition: () => void;
  isLoading: boolean;
}

/** Shared footer bar with discard/insert actions for all preview views. */
export const PreviewFooter: React.FC<PreviewFooterProps> = ({
  onDiscard,
  onInsertAtPosition,
  isLoading,
}) => {
  const { t } = useTranslation();

  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2 border-t p-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="flex-1 text-muted-foreground"
        onClick={onDiscard}
      >
        <X size={14} />
        {t("aiMenu.discard")}
      </Button>
      <Button
        type="button"
        variant="default"
        size="sm"
        className="flex-1"
        onClick={onInsertAtPosition}
      >
        <MousePointerClick size={14} />
        {t("askAi.insertInNote")}
      </Button>
    </div>
  );
};
