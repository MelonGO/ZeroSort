import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { ToolbarGroupVisibility } from "@/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bold,
  ChevronLeft,
  Heading1,
  LinkIcon,
  List,
  PenLine,
  Quote,
  Sparkles,
  Undo,
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

/**
 * The route configuration for the editor settings page.
 */
export const Route = createFileRoute("/settings/editor")({
  component: () => <EditorSettings />,
});

interface SettingItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
}

/**
 * A reusable component for displaying a single setting item.
 */
const SettingItem = ({
  icon: Icon,
  title,
  description,
  children,
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
      <div className="flex items-center space-x-2">{children}</div>
    </div>
  );
};

/** Toolbar group definitions for rendering the settings list */
const TOOLBAR_GROUP_ITEMS: {
  key: keyof ToolbarGroupVisibility;
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
}[] = [
  {
    key: "history",
    icon: Undo,
    titleKey: "settings.editor.toolbar.history.title",
    descriptionKey: "settings.editor.toolbar.history.description",
  },
  {
    key: "headings",
    icon: Heading1,
    titleKey: "settings.editor.toolbar.headings.title",
    descriptionKey: "settings.editor.toolbar.headings.description",
  },
  {
    key: "formatting",
    icon: Bold,
    titleKey: "settings.editor.toolbar.formatting.title",
    descriptionKey: "settings.editor.toolbar.formatting.description",
  },
  {
    key: "lists",
    icon: List,
    titleKey: "settings.editor.toolbar.lists.title",
    descriptionKey: "settings.editor.toolbar.lists.description",
  },
  {
    key: "block",
    icon: Quote,
    titleKey: "settings.editor.toolbar.block.title",
    descriptionKey: "settings.editor.toolbar.block.description",
  },
  {
    key: "insert",
    icon: LinkIcon,
    titleKey: "settings.editor.toolbar.insert.title",
    descriptionKey: "settings.editor.toolbar.insert.description",
  },
  {
    key: "tools",
    icon: Sparkles,
    titleKey: "settings.editor.toolbar.tools.title",
    descriptionKey: "settings.editor.toolbar.tools.description",
  },
];

/**
 * The editor settings page component.
 * Allows users to enable or disable editor toolbar button groups.
 */
const EditorSettings = () => {
  const { t } = useTranslation();
  const toolbarGroups = useStore((state) => state.toolbarGroups);
  const setToolbarGroups = useStore((state) => state.setToolbarGroups);

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
            <PenLine className="text-foreground" size={24} />
          </div>
          <h1 className="text-2xl font-bold">{t("settings.editor.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("settings.editor.description")}
        </p>
      </header>

      <section>
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("settings.editor.toolbar.title")}
        </h3>

        {TOOLBAR_GROUP_ITEMS.map((item) => {
          const isEnabled = toolbarGroups[item.key];
          return (
            <SettingItem
              key={item.key}
              icon={item.icon}
              title={t(item.titleKey)}
              description={t(item.descriptionKey)}
            >
              <div className="flex rounded-lg bg-muted p-1">
                <button
                  onClick={() => setToolbarGroups({ [item.key]: false })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    !isEnabled
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("common.off")}
                </button>
                <button
                  onClick={() => setToolbarGroups({ [item.key]: true })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    isEnabled
                      ? "bg-card text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("common.on")}
                </button>
              </div>
            </SettingItem>
          );
        })}
      </section>
    </div>
  );
};
