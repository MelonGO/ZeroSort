import { ModelManager } from "@/components/model-manager/ModelManager";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The route configuration for the model management settings page.
 */
export const Route = createFileRoute("/settings/models")({
  component: ModelManagement,
});

/**
 * The model management settings page component.
 * Integrates the ModelManager component for multi-provider AI configuration.
 *
 * @returns The rendered model management view.
 */
function ModelManagement() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 animate-in flex-col space-y-8 duration-500 fade-in slide-in-from-bottom-4">
      <header className="shrink-0">
        <div className="mb-4 flex items-center space-x-2 md:hidden">
          <Link
            to="/settings"
            className="flex items-center text-[1rem] font-medium transition-colors hover:text-accent"
          >
            <ChevronLeft size={20} className="mr-1" />
            {t("settings.back")}
          </Link>
        </div>
        <div className="mb-2 flex items-center space-x-3">
          <div className="rounded-xl bg-muted p-2">
            <Cpu className="text-foreground" size={24} />
          </div>
          <h1 className="text-2xl font-bold">{t("settings.models.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("settings.models.description")}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <ModelManager />
      </div>
    </div>
  );
}
