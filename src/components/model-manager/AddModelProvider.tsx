import { PROVIDER_TEMPLATES } from "@/lib/constants";
import type { ProviderTemplate } from "@/types/model";
import { ChevronRight, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface AddModelProviderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: ProviderTemplate) => void;
  existingTemplateIds?: string[];
}

export function AddModelProvider({
  open,
  onOpenChange,
  onSelect,
  existingTemplateIds = [],
}: AddModelProviderProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
      <div
        className="flex max-h-[80vh] w-full max-w-2xl animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border p-8">
          <div>
            <h3 className="text-2xl font-bold text-foreground">
              {t("settings.models.createProvider")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.models.createDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-8">
          {/* Grid of Templates */}
          <div className="mb-4 text-xs font-bold tracking-widest text-muted-foreground uppercase">
            {t("settings.models.templates")}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PROVIDER_TEMPLATES.map((template) => {
              const isCustomTemplate = template.id === "openai-compatible";
              const isAdded =
                !isCustomTemplate && existingTemplateIds.includes(template.id);
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => !isAdded && onSelect(template)}
                  disabled={isAdded}
                  className={`group flex items-center justify-between rounded-2xl border p-5 text-left transition-all ${
                    isAdded
                      ? "cursor-not-allowed border-border bg-muted/50 grayscale"
                      : "border-border hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span
                        className={`font-bold transition-colors ${isAdded ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {template.name}
                      </span>
                      {isAdded && (
                        <span className="text-[10px] font-bold tracking-tight text-muted-foreground uppercase">
                          {t("common.alreadyAdded")}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isAdded && (
                    <ChevronRight
                      className="text-muted-foreground transition-colors group-hover:text-primary"
                      size={20}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div
        className="absolute inset-0 -z-10"
        onClick={() => onOpenChange(false)}
      />
    </div>,
    document.body,
  );
}
