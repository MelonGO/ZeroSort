import type { Model } from "@/types/model";
import { Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface ModelEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (model: Model) => void;
  initialModel?: Model;
}

export function ModelEditModal({
  open,
  onOpenChange,
  onSave,
  initialModel,
}: ModelEditModalProps) {
  const { t } = useTranslation();
  const [model, setModel] = useState<Model>({
    id: "",
    name: "",
    family: "",
  });

  useEffect(() => {
    if (initialModel) {
      setModel(initialModel);
    } else {
      setModel({
        id: "",
        name: "",
        family: "",
      });
    }
  }, [initialModel, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
      <div
        className="flex w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-8">
          <h3 className="text-2xl font-bold text-foreground">
            {initialModel
              ? t("settings.models.editModel")
              : t("settings.models.addModel")}
          </h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-8">
          <div>
            <label className="mb-2 block text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {t("settings.models.modelName")}
            </label>
            <input
              type="text"
              value={model.name}
              onChange={(e) => setModel({ ...model, name: e.target.value })}
              className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. DeepSeek V4 Pro"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {t("settings.models.modelId")}
            </label>
            <input
              type="text"
              value={model.id}
              onChange={(e) => setModel({ ...model, id: e.target.value })}
              className="w-full rounded-xl border-none bg-muted px-4 py-3 font-mono text-sm transition-all outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. deepseek-v4-pro"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {t("settings.models.familyGroup")}
            </label>
            <input
              type="text"
              value={model.family}
              onChange={(e) => setModel({ ...model, family: e.target.value })}
              className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. DeepSeek"
            />
          </div>
        </div>

        <div className="flex gap-4 border-t border-border bg-muted/50 p-8">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-2xl border border-border bg-card py-3 font-bold text-foreground transition-all hover:bg-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onSave(model)}
            disabled={!model.id || !model.name}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 disabled:shadow-none"
          >
            <Save size={18} />
            {t("common.save")}
          </button>
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
