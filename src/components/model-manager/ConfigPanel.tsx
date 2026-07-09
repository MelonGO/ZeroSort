import { ModelEditModal } from "@/components/model-manager/ModelEditModal";
import { testProviderConnection } from "@/lib/ai/provider";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { Model, ProviderConfig } from "@/types/model";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudAlert,
  CloudCheck,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface ConfigPanelProps {
  config: ProviderConfig;
  onUpdate: (updates: Partial<ProviderConfig>) => void;
  onDelete?: () => void;
}

export function ConfigPanel({ config, onUpdate, onDelete }: ConfigPanelProps) {
  const { t } = useTranslation();
  const selectedModelId = useStore((state) => state.selectedModelId);
  const setSelectedModelId = useStore((state) => state.setSelectedModelId);
  const [showKey, setShowKey] = useState(false);
  const [expandedFamilies, setExpandedFamilies] = useState<
    Record<string, boolean>
  >({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | undefined>(
    undefined,
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );

  const isCustomProvider = config.templateId === "openai-compatible";

  const isFamilyExpanded = (family: string) =>
    expandedFamilies[family] !== false;

  const toggleFamily = (family: string) => {
    setExpandedFamilies((prev) => ({
      ...prev,
      [family]: !isFamilyExpanded(family),
    }));
  };

  const handleEditModel = (model: Model) => {
    setEditingModel(model);
    setIsEditModalOpen(true);
  };

  const handleAddNewModel = () => {
    setEditingModel(undefined);
    setIsEditModalOpen(true);
  };

  const handleSaveModel = (updatedModel: Model) => {
    let newModels: Model[];
    if (editingModel) {
      // Editing existing
      newModels = config.models.map((m) =>
        m.id === editingModel.id ? updatedModel : m,
      );
    } else {
      // Adding new
      newModels = [...config.models, updatedModel];
    }
    onUpdate({ models: newModels });
    setIsEditModalOpen(false);
  };

  const handleDeleteModel = (modelId: string) => {
    const newModels = config.models.filter((m) => m.id !== modelId);
    onUpdate({ models: newModels });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus("idle");
    const result = await testProviderConnection(config);
    setIsTesting(false);
    if (result.success) {
      setTestStatus("success");
      toast.success(t("settings.models.connectionSuccess"));
    } else {
      setTestStatus("error");
      toast.error(
        t("settings.models.connectionFailed", { error: result.error }),
      );
    }
  };

  const families = useMemo(
    () =>
      Array.from(
        new Set(config.models.map((model) => model.family || "Uncategorized")),
      ),
    [config.models],
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground capitalize">
            {config.name}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "h-6 w-12 cursor-pointer rounded-full p-1 transition-colors",
              config.enabled ? "bg-primary" : "bg-muted",
            )}
            onClick={() => onUpdate({ enabled: !config.enabled })}
          >
            <div
              className={cn(
                "h-4 w-4 transform rounded-full bg-primary-foreground shadow-sm transition-transform",
                config.enabled ? "translate-x-6" : "translate-x-0",
              )}
            />
          </div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-full p-2 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
              title={t("common.delete")}
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-8 p-6">
        {/* Provider Name */}
        {isCustomProvider && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
                {t("settings.models.providerName")}
              </label>
            </div>
            <input
              type="text"
              value={config.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="w-full rounded-xl border-none bg-muted px-4 py-2.5 text-sm transition-all outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("settings.models.providerNamePlaceholder")}
            />
          </div>
        )}

        {/* API Key */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {t("settings.ai.apiKey")}
            </label>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={config.apiKey}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                className="w-full rounded-xl border-none bg-muted px-4 py-2.5 text-sm transition-all outline-none focus:ring-2 focus:ring-primary"
                placeholder={t("settings.ai.apiKeyPlaceholder")}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* API Base URL */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {t("settings.ai.baseUrl")}
            </label>
          </div>
          <input
            type="text"
            value={config.baseUrl}
            onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            className="w-full rounded-xl border-none bg-muted px-4 py-2.5 text-sm transition-all outline-none focus:ring-2 focus:ring-primary"
            placeholder="https://api.example.com"
          />
        </div>

        {/* Models Section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                {t("settings.ai.models")}
              </label>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                {config.models.length}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {families.map((family) => {
              const expanded = isFamilyExpanded(family);
              return (
                <div
                  key={family}
                  className="overflow-hidden rounded-2xl border border-border"
                >
                  <button
                    onClick={() => toggleFamily(family)}
                    className="flex w-full items-center justify-between bg-muted/50 px-4 py-3 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? (
                        <ChevronDown
                          size={16}
                          className="text-muted-foreground"
                        />
                      ) : (
                        <ChevronUp
                          size={16}
                          className="text-muted-foreground"
                        />
                      )}
                      <span className="text-sm font-bold text-foreground">
                        {family}
                      </span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="divide-y divide-border bg-card">
                      {config.models
                        .filter((m) => (m.family || "Uncategorized") === family)
                        .map((model) => (
                          <div
                            key={model.id}
                            onClick={() => {
                              if (!config.enabled) {
                                return;
                              }
                              setSelectedModelId(model.id);
                            }}
                            className={cn(
                              "group flex items-center justify-between px-4 py-3 transition-colors",
                              config.enabled
                                ? "cursor-pointer hover:bg-primary/5"
                                : "cursor-not-allowed opacity-60",
                              selectedModelId === model.id && "bg-primary/10",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                                  selectedModelId === model.id
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                    : "bg-muted text-muted-foreground group-hover:bg-muted/80",
                                )}
                              >
                                {selectedModelId === model.id ? (
                                  <CheckCircle2 size={16} />
                                ) : (
                                  <Sparkles size={14} />
                                )}
                              </div>
                              <div className="flex flex-col text-left">
                                <span
                                  className={cn(
                                    "text-sm font-semibold transition-colors",
                                    selectedModelId === model.id
                                      ? "text-primary"
                                      : "text-foreground",
                                  )}
                                >
                                  {model.name}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {model.id}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditModel(model);
                                }}
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                title={t("common.edit")}
                              >
                                <Settings size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteModel(model.id);
                                }}
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                title={t("common.delete")}
                              >
                                <Minus size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex gap-3 pt-6">
          <button
            onClick={handleAddNewModel}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
          >
            <Plus size={18} />
            {t("common.add")}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !config.apiKey || config.models.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3 font-bold text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testStatus === "success" ? (
              <CloudCheck size={18} />
            ) : testStatus === "error" ? (
              <CloudAlert size={18} />
            ) : (
              <Cloud size={18} className={isTesting ? "animate-pulse" : ""} />
            )}
            {isTesting
              ? t("settings.models.testing")
              : t("settings.models.testConnection")}
          </button>
        </div>
      </div>

      <ModelEditModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSave={handleSaveModel}
        initialModel={editingModel}
      />
    </div>
  );
}
