import { AddModelProvider } from "@/components/model-manager/AddModelProvider";
import { ConfigPanel } from "@/components/model-manager/ConfigPanel";
import { INITIAL_MODELS } from "@/lib/constants";
import { useStore } from "@/store/useStore";
import type { ProviderConfig, ProviderTemplate } from "@/types/model";
import { Plus, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export function ModelManager() {
  const { t } = useTranslation();
  const configs = useStore((state) => state.modelConfigs);
  const activeConfigId = useStore((state) => state.activeConfigId);
  const setActiveConfigId = useStore((state) => state.setActiveConfigId);
  const addProviderConfig = useStore((state) => state.addProviderConfig);
  const updateProviderConfig = useStore((state) => state.updateProviderConfig);
  const deleteProviderConfig = useStore((state) => state.deleteProviderConfig);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreate = (template: ProviderTemplate) => {
    const newConfig: ProviderConfig = {
      id: `config-${template.id}-${Date.now()}`,
      templateId: template.id,
      name: template.name,
      enabled: true,
      apiKey: "",
      baseUrl: template.defaultUrl || "",
      models: INITIAL_MODELS[template.id] || [],
    };
    addProviderConfig(newConfig);
    setIsModalOpen(false);
  };

  const activeConfig = useMemo(
    () => configs.find((config) => config.id === activeConfigId),
    [activeConfigId, configs],
  );
  const existingTemplateIds = useMemo(
    () => configs.map((config) => config.templateId),
    [configs],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent md:flex-row">
      {/* Sidebar */}
      <div className="flex h-2/5 min-h-0 w-full flex-col gap-2 border-r border-border p-4 md:h-full md:w-64">
        <div className="mb-4 flex shrink-0 items-center justify-between px-2 md:mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Settings size={18} className="text-primary" />
            <span>{t("settings.models.providers")}</span>
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {configs.map((config) => (
            <button
              key={config.id}
              onClick={() => setActiveConfigId(config.id)}
              className={`group flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                activeConfigId === config.id
                  ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full transition-colors ${config.enabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-muted"}`}
                />
                <div className="flex flex-col text-left">
                  <span className="mb-1 text-sm leading-none font-medium">
                    {config.name}
                  </span>
                  <span
                    className={`text-[10px] font-bold tracking-tighter uppercase ${config.enabled ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {config.enabled ? t("common.on") : t("common.off")}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="mt-2 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 md:mt-4"
        >
          <Plus size={20} />
          {t("settings.models.addNew")}
        </button>
      </div>
      {/* Main Content Area */}
      <div className="min-h-0 w-full flex-1 overflow-y-auto bg-background p-4 md:p-8">
        {activeConfig ? (
          <div className="animate-in duration-300 fade-in slide-in-from-bottom-4">
            <ConfigPanel
              config={activeConfig}
              onUpdate={(updates) =>
                updateProviderConfig(activeConfig.id, updates)
              }
              onDelete={() => deleteProviderConfig(activeConfig.id)}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center space-y-4 text-muted-foreground">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-muted text-muted-foreground/50">
              <Plus size={40} />
            </div>
            <div className="text-center">
              <p className="font-bold text-foreground">
                {t("settings.models.noProviderSelected")}
              </p>
              <p className="text-sm">{t("settings.models.selectOrCreate")}</p>
            </div>
          </div>
        )}
      </div>

      <AddModelProvider
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSelect={handleCreate}
        existingTemplateIds={existingTemplateIds}
      />
    </div>
  );
}
