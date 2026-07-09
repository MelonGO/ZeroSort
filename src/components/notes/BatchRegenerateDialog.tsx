import { ModelSelectDropdown } from "@/components/editor/ModelSelectDropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStore } from "@/store/useStore";
import { RegenerateField } from "@/types";
import {
  Check,
  FileText,
  Folder,
  FolderTree,
  Sparkles,
  Tag,
  Type,
  X,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface BatchRegenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: (fields: RegenerateField[]) => void;
}

/**
 * Dialog for selecting which fields to regenerate in a batch operation.
 */
export function BatchRegenerateDialog({
  isOpen,
  onClose,
  selectedCount,
  onConfirm,
}: BatchRegenerateDialogProps) {
  const { t } = useTranslation();
  const includeExistingDirs = useStore((state) => state.includeExistingDirs);
  const batchConcurrency = useStore((state) => state.batchConcurrency);
  const setIncludeExistingDirs = useStore(
    (state) => state.setIncludeExistingDirs,
  );
  const setBatchConcurrency = useStore((state) => state.setBatchConcurrency);

  const [selectedFields, setSelectedFields] = useState<
    Record<RegenerateField, boolean>
  >({
    title: true,
    summary: true,
    catalog: true,
    tags: true,
  });

  if (!isOpen) return null;

  const toggleField = (field: RegenerateField) => {
    setSelectedFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const selectedFieldList = (
    Object.keys(selectedFields) as RegenerateField[]
  ).filter((key) => selectedFields[key]);

  const handleConfirm = () => {
    if (selectedFieldList.length === 0) return;
    onConfirm(selectedFieldList);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex animate-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200 fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-in rounded-2xl bg-card p-6 shadow-2xl duration-200 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-primary" />
            <h3 className="text-lg font-semibold">{t("batch.dialogTitle")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {t("batch.dialogDescription", { count: selectedCount })}
        </p>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-muted bg-muted/20 px-3 py-2.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("settings.models.modelSelect", "AI Models")}
          </span>
          <ModelSelectDropdown
            align="end"
            portal={false}
            className="max-w-none"
          />
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl border border-muted bg-muted/20 px-3 py-2.5">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">
              {t("batch.concurrency")}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {t("batch.concurrencyDescription")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={batchConcurrency}
              onChange={(e) => setBatchConcurrency(Number(e.target.value))}
              className="h-1.5 w-20 cursor-pointer accent-primary"
            />
            <span className="w-5 text-right text-xs font-medium tabular-nums">
              {batchConcurrency}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {(
            [
              { id: "title" as const, icon: Type, label: t("common.title") },
              {
                id: "summary" as const,
                icon: FileText,
                label: t("note.summary"),
              },
              {
                id: "catalog" as const,
                icon: Folder,
                label: t("sidebar.folders"),
              },
              {
                id: "tags" as const,
                icon: Tag,
                label: t("sidebar.tags"),
              },
            ] as const
          ).map((field) => (
            <div key={field.id}>
              <button
                type="button"
                onClick={() => toggleField(field.id)}
                className={`flex w-full items-center justify-between rounded-xl border-2 p-4 transition-all ${
                  selectedFields[field.id]
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-accent/50"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <field.icon
                    size={20}
                    className={
                      selectedFields[field.id]
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  />
                  <span
                    className={`font-medium ${selectedFields[field.id] ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {field.label}
                  </span>
                </div>
                {selectedFields[field.id] && (
                  <Check size={20} className="text-primary" />
                )}
              </button>

              {field.id === "catalog" && selectedFields.catalog && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() =>
                        setIncludeExistingDirs(!includeExistingDirs)
                      }
                      className="mt-1.5 ml-4 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg border border-muted bg-muted/30 px-3 py-2.5 transition-all hover:bg-muted/50"
                    >
                      <div className="flex items-center space-x-2">
                        <FolderTree
                          size={16}
                          className={
                            includeExistingDirs
                              ? "text-primary"
                              : "text-muted-foreground"
                          }
                        />
                        <span
                          className={`text-xs font-medium ${includeExistingDirs ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {t("ai.includeExistingDirs")}
                        </span>
                      </div>
                      <div
                        className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                          includeExistingDirs
                            ? "bg-primary"
                            : "bg-muted-foreground/30"
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            includeExistingDirs
                              ? "translate-x-4"
                              : "translate-x-0"
                          }`}
                        />
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("ai.includeExistingDirsTooltip")}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedFieldList.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles size={16} />
            {t("batch.startRegeneration", { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
