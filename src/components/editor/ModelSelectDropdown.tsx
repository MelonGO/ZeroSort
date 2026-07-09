import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { ChevronDown, Sparkles } from "lucide-react";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface ModelSelectDropdownProps {
  className?: string;
  align?: "start" | "center" | "end";
  portal?: boolean;
}

export const ModelSelectDropdown: React.FC<ModelSelectDropdownProps> = ({
  className,
  align = "end",
  portal = true,
}) => {
  const { t } = useTranslation();
  const modelConfigs = useStore((state) => state.modelConfigs);
  const selectedModelId = useStore((state) => state.selectedModelId);
  const setSelectedModelId = useStore((state) => state.setSelectedModelId);
  const setActiveConfigId = useStore((state) => state.setActiveConfigId);

  // Find the model name by searching across all configs
  const selectedModelName = useMemo(() => {
    for (const config of modelConfigs) {
      const model = config.models.find((m) => m.id === selectedModelId);
      if (model) return model.name;
    }
    return (
      selectedModelId || t("settings.models.noModels", "No Model Selected")
    );
  }, [modelConfigs, selectedModelId, t]);

  // Handler to select model and update the active config
  const handleSelectModel = (configId: string, modelId: string) => {
    setActiveConfigId(configId);
    setSelectedModelId(modelId);
  };

  const enabledConfigs = modelConfigs.filter((c) => c.enabled);
  const hasEnabledModels = enabledConfigs.some((c) => c.models.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex max-w-35 items-center space-x-1.5 rounded-md border border-accent/20 bg-muted px-2.5 py-1.5 text-[10px] font-medium text-primary transition-all hover:bg-accent/20 sm:max-w-none",
            className,
          )}
        >
          <Sparkles size={12} className="shrink-0" />
          <span className="truncate">{selectedModelName}</span>
          <ChevronDown size={10} className="shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56" portal={portal}>
        <DropdownMenuLabel className="px-3 py-2 text-[10px] tracking-wider text-muted-foreground uppercase">
          {t("settings.models.modelSelect", "AI Models")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-75 overflow-y-auto">
          {enabledConfigs.map((config) => (
            <React.Fragment key={config.id}>
              {config.models.length > 0 && (
                <>
                  <DropdownMenuLabel className="bg-muted/50 px-3 py-1.5 text-[9px] text-muted-foreground/60">
                    {config.name}
                  </DropdownMenuLabel>
                  {config.models.map((model) => (
                    <DropdownMenuItem
                      key={`${config.id}-${model.id}`}
                      onClick={() => handleSelectModel(config.id, model.id)}
                      className={cn(
                        "mx-1 my-0.5 cursor-pointer rounded-sm px-3 py-2 text-xs",
                        selectedModelId === model.id &&
                          "bg-accent text-primary",
                      )}
                    >
                      {model.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </React.Fragment>
          ))}
          {!hasEnabledModels && (
            <DropdownMenuItem disabled className="px-3 py-2 text-xs">
              {t("settings.models.noModels", "No models configured")}
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
