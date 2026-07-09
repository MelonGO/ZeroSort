import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { languageAutonyms, supportedLanguages } from "@/i18n";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { Language } from "@/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
  Code,
  Eye,
  FileText,
  Folder,
  Hash,
  Laptop,
  Layers,
  Monitor,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

/**
 * The route configuration for the general settings page.
 */
export const Route = createFileRoute("/settings/general")({
  component: () => <GeneralSettings />,
});

interface SettingItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
  rightElement?: React.ReactNode;
}

/**
 * A reusable component for displaying a single setting item.
 */
const SettingItem = ({
  icon: Icon,
  title,
  description,
  children,
  rightElement,
}: SettingItemProps) => {
  return (
    <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center space-x-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {children}
        {rightElement}
      </div>
    </div>
  );
};

/**
 * The general settings page component.
 * Allows users to configure theme, language, and scaling preferences.
 */
const GeneralSettings = () => {
  const { t } = useTranslation();
  const theme = useStore((state) => state.theme);
  const setTheme = useStore((state) => state.setTheme);
  const currentLanguage = useStore((state) => state.language);
  const setLanguage = useStore((state) => state.setLanguage);
  const interfaceScale = useStore((state) => state.interfaceScale);
  const setInterfaceScale = useStore((state) => state.setInterfaceScale);
  const contentScale = useStore((state) => state.contentScale);
  const setContentScale = useStore((state) => state.setContentScale);
  const codeWrapEnabled = useStore((state) => state.codeWrapEnabled);
  const setCodeWrapEnabled = useStore((state) => state.setCodeWrapEnabled);
  const showFolderNoteCount = useStore((state) => state.showFolderNoteCount);
  const setShowFolderNoteCount = useStore(
    (state) => state.setShowFolderNoteCount,
  );
  const showCharacterCount = useStore((state) => state.showCharacterCount);
  const setShowCharacterCount = useStore(
    (state) => state.setShowCharacterCount,
  );

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  const handleThemeChange = (
    newTheme: "light" | "dark" | "system",
    event: React.MouseEvent,
  ) => {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (
      !document.startViewTransition ||
      prefersReducedMotion ||
      newTheme === theme
    ) {
      setTheme(newTheme);
      return;
    }

    root.style.setProperty("--x", `${event.clientX}px`);
    root.style.setProperty("--y", `${event.clientY}px`);

    document.startViewTransition(() => {
      setTheme(newTheme);
    });
  };

  return (
    <div className="flex-1 animate-in space-y-8 overflow-y-auto pr-2 duration-500 fade-in slide-in-from-bottom-4">
      <header>
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
            <Settings className="text-foreground" size={24} />
          </div>
          <h1 className="text-2xl font-bold">{t("settings.general.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("settings.general.description")}
        </p>
      </header>

      <section>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("settings.general.interface.title")}
        </h3>

        <SettingItem
          icon={Monitor}
          title={t("settings.general.interface.theme.title")}
          description={t("settings.general.interface.theme.description")}
        >
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={(e) => handleThemeChange("light", e)}
              className={cn(
                "rounded-md p-1.5 transition-all",
                theme === "light"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Sun size={16} />
            </button>
            <button
              onClick={(e) => handleThemeChange("dark", e)}
              className={cn(
                "rounded-md p-1.5 transition-all",
                theme === "dark"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Moon size={16} />
            </button>
            <button
              onClick={(e) => handleThemeChange("system", e)}
              className={cn(
                "rounded-md p-1.5 transition-all",
                theme === "system"
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Laptop size={16} />
            </button>
          </div>
        </SettingItem>

        <SettingItem
          icon={Layers}
          title={t("settings.general.interface.language.title")}
          description={t("settings.general.interface.language.description")}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10">
                <span>{languageAutonyms[currentLanguage]}</span>
                <ChevronDown size={16} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 rounded-2xl border border-border bg-popover p-2 shadow-xl"
            >
              <DropdownMenuRadioGroup
                value={currentLanguage}
                onValueChange={(val) => handleLanguageChange(val as Language)}
              >
                {supportedLanguages.map((language) => (
                  <DropdownMenuRadioItem
                    key={language}
                    value={language}
                    className="flex cursor-pointer items-center justify-between rounded-xl transition-colors outline-none focus:bg-accent focus:text-accent-foreground"
                  >
                    <span className="text-sm font-medium">
                      {languageAutonyms[language]}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingItem>

        <SettingItem
          icon={Eye}
          title={t("settings.general.interface.interfaceScale.title")}
          description={t(
            "settings.general.interface.interfaceScale.description",
          )}
        >
          <div className="flex w-48 flex-col items-center">
            <div className="mb-2 flex w-full justify-between text-[10px] text-muted-foreground">
              <span>75%</span>
              <span className="font-bold text-foreground">
                {interfaceScale}%
              </span>
              <span>150%</span>
            </div>
            <Slider
              min={75}
              max={150}
              step={1}
              value={[interfaceScale]}
              onValueChange={(vals) => setInterfaceScale(vals[0])}
              className="w-full"
            />
          </div>
        </SettingItem>

        <SettingItem
          icon={FileText}
          title={t("settings.general.interface.contentScale.title")}
          description={t("settings.general.interface.contentScale.description")}
          rightElement={
            <div className="flex items-center">
              <span
                className={cn(
                  "text-muted-foreground transition-all duration-200",
                  contentScale === "sm" && "text-sm",
                  contentScale === "base" && "text-base",
                  contentScale === "lg" && "text-lg",
                  contentScale === "xl" && "text-xl",
                  contentScale === "2xl" && "text-2xl",
                )}
              >
                Aa
              </span>
            </div>
          }
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10">
                <span>
                  {t(
                    `settings.general.interface.contentScale.sizes.${contentScale}`,
                  )}
                </span>
                <ChevronDown size={16} className="text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 rounded-2xl border border-border bg-popover p-2 shadow-xl"
            >
              <DropdownMenuRadioGroup
                value={contentScale}
                onValueChange={(val) =>
                  setContentScale(val as "sm" | "base" | "lg" | "xl" | "2xl")
                }
              >
                {(["sm", "base", "lg", "xl", "2xl"] as const).map((size) => (
                  <DropdownMenuRadioItem
                    key={size}
                    value={size}
                    className="flex cursor-pointer items-center justify-between rounded-xl transition-colors outline-none focus:bg-accent focus:text-accent-foreground"
                  >
                    <span className="text-sm font-medium">
                      {t(
                        `settings.general.interface.contentScale.sizes.${size}`,
                      )}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingItem>

        <SettingItem
          icon={Code}
          title={t("settings.general.interface.codeWrap.title")}
          description={t("settings.general.interface.codeWrap.description")}
        >
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setCodeWrapEnabled(false)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                !codeWrapEnabled
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("settings.general.interface.codeWrap.scroll")}
            </button>
            <button
              onClick={() => setCodeWrapEnabled(true)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                codeWrapEnabled
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("settings.general.interface.codeWrap.wrap")}
            </button>
          </div>
        </SettingItem>

        <SettingItem
          icon={Folder}
          title={t("settings.general.interface.showFolderNoteCount.title")}
          description={t(
            "settings.general.interface.showFolderNoteCount.description",
          )}
        >
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setShowFolderNoteCount(false)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                !showFolderNoteCount
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("common.off")}
            </button>
            <button
              onClick={() => setShowFolderNoteCount(true)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                showFolderNoteCount
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("common.on")}
            </button>
          </div>
        </SettingItem>

        <SettingItem
          icon={Hash}
          title={t("settings.general.interface.showCharacterCount.title")}
          description={t(
            "settings.general.interface.showCharacterCount.description",
          )}
        >
          <div className="flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setShowCharacterCount(false)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                !showCharacterCount
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("common.off")}
            </button>
            <button
              onClick={() => setShowCharacterCount(true)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                showCharacterCount
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("common.on")}
            </button>
          </div>
        </SettingItem>
      </section>
    </div>
  );
};
