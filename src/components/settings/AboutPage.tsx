import { ZeroSortIcon } from "@/components/ui/icons";
import { getAppVersionFromMain, isTauri } from "@/lib/desktop-adapter";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const FALLBACK_APP_VERSION = "0.1.0";

/**
 * Renders the About settings page with version and website info.
 *
 * @returns The rendered about page
 */
export function AboutPage() {
  const { t } = useTranslation();
  const [currentVersion, setCurrentVersion] = useState(FALLBACK_APP_VERSION);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    void getAppVersionFromMain()
      .then((version) => {
        if (version) {
          setCurrentVersion(version);
        }
      })
      .catch(() => {});
  }, []);

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
              {t("about.version")}: {currentVersion}
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

      <footer className="mt-12 border-t border-border pt-8 text-center">
        <p className="text-xs text-muted-foreground">{t("about.footer")}</p>
      </footer>
    </div>
  );
}
