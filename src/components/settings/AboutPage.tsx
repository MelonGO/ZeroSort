import { Button } from "@/components/ui/button";
import { ZeroSortIcon } from "@/components/ui/icons";
import { useAppUpdater } from "@/hooks/useAppUpdater";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Download, Globe, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function resolveUpdaterMessage(
  t: (key: string, values?: Record<string, unknown>) => string,
  error: string | null,
  fallbackKey: string,
): string {
  if (!error) {
    return t(fallbackKey);
  }

  if (error.startsWith("about.updater.")) {
    return t(error);
  }

  return error;
}

/**
 * Renders the About settings page with version and updater controls.
 *
 * @returns The rendered about page
 */
export function AboutPage() {
  const { t } = useTranslation();
  const updater = useAppUpdater();

  useEffect(() => {
    if (!updater.isSupported || updater.status !== "idle") {
      return;
    }

    void updater.checkForUpdates().catch(() => {});
  }, [updater.isSupported, updater.status, updater.checkForUpdates]);

  const downloadPercent =
    updater.progress?.totalBytes && updater.progress.totalBytes > 0
      ? Math.min(
          100,
          Math.round(
            (updater.progress.downloadedBytes / updater.progress.totalBytes) *
              100,
          ),
        )
      : null;

  async function handleCheckForUpdates() {
    try {
      const result = await updater.checkForUpdates();

      if (result === "upToDate") {
        toast.success(t("about.updater.toast.upToDate"));
      }
    } catch {
      toast.error(
        resolveUpdaterMessage(t, updater.error, "about.updater.errors.check"),
      );
    }
  }

  async function handleInstallUpdate() {
    try {
      await updater.installUpdate();
    } catch {
      toast.error(
        resolveUpdaterMessage(t, updater.error, "about.updater.errors.install"),
      );
    }
  }

  const statusText = (() => {
    switch (updater.status) {
      case "checking":
        return t("about.updater.status.checking");
      case "upToDate":
        return t("about.updater.status.upToDate");
      case "available":
        return updater.availableUpdate
          ? t("about.updater.status.available", {
              version: updater.availableUpdate.version,
            })
          : t("about.updater.status.availableUnknown");
      case "downloading":
        return t("about.updater.status.downloading");
      case "installing":
        return t("about.updater.status.installing");
      case "completed":
        return t("about.updater.status.completed");
      case "error":
        return resolveUpdaterMessage(
          t,
          updater.error,
          "about.updater.errors.check",
        );
      default:
        return updater.isSupported
          ? t("about.updater.status.idle")
          : t("about.updater.status.unsupported");
    }
  })();

  return (
    <div className="max-w-2xl flex-1 animate-in overflow-y-auto pr-2 duration-500 fade-in slide-in-from-bottom-4">
      <header className="mb-8">
        <div className="mb-4 flex items-center space-x-2 md:hidden">
          <Link
            to="/settings"
            className="flex items-center text-[1rem] font-medium transition-colors hover:text-accent"
          >
            <ChevronLeft size={20} className="mr-1" />
            {t("settings.back")}
          </Link>
        </div>
        <div className="mb-4 flex items-center space-x-3">
          <div className="rounded-2xl border border-border bg-transparent p-1 shadow-lg">
            <ZeroSortIcon className="h-16 w-16 dark:invert" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">ZeroSort</h1>
            <p className="font-medium text-muted-foreground">
              {t("about.version")}: {updater.currentVersion}
            </p>
          </div>
        </div>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {t("about.description")}
        </p>
      </header>

      <div className="mb-8">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-2 flex items-center space-x-2 font-semibold">
            <Globe size={18} />
            <span>{t("about.website")}</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("about.websiteDesc")}
          </p>
          <a
            href="https://zerosort.app"
            target="_blank"
            className="mt-4 inline-block text-sm font-medium hover:underline"
          >
            {t("about.visitWebsite")}
          </a>
        </div>
      </div>

      <div className="mb-8">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <h3 className="font-semibold">{t("about.updater.title")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("about.updater.description")}
              </p>
              <p className="text-sm font-medium">{statusText}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {updater.isSupported && (
                <Button
                  variant="outline"
                  onClick={() => void handleCheckForUpdates()}
                  disabled={
                    updater.status === "checking" ||
                    updater.status === "downloading" ||
                    updater.status === "installing"
                  }
                >
                  <RefreshCw className="size-4" />
                  <span>{t("about.updater.actions.check")}</span>
                </Button>
              )}
              {updater.isSupported && updater.availableUpdate && (
                <Button
                  onClick={() => void handleInstallUpdate()}
                  disabled={
                    updater.status === "checking" ||
                    updater.status === "downloading" ||
                    updater.status === "installing"
                  }
                >
                  <Download className="size-4" />
                  <span>{t("about.updater.actions.install")}</span>
                </Button>
              )}
            </div>
          </div>

          {updater.progress && (
            <div className="mt-4 space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{
                    width: `${downloadPercent ?? 15}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {downloadPercent !== null
                  ? t("about.updater.progress.percent", {
                      percent: downloadPercent,
                    })
                  : t("about.updater.progress.unknown")}
              </p>
            </div>
          )}

          {updater.availableUpdate?.notes && (
            <div className="mt-4 rounded-xl border border-border/70 bg-accent/10 p-3">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("about.updater.releaseNotes")}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {updater.availableUpdate.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-12 border-t border-border pt-8 text-center">
        <p className="text-xs text-muted-foreground">{t("about.footer")}</p>
      </footer>
    </div>
  );
}
