import { Progress } from "@/components/ui/progress";
import {
  previewEmptyDirectoriesAction,
  previewUnusedTagsAction,
} from "@/lib/actions";
import type { IoProgress } from "@/lib/io";
import { useStore } from "@/store/useStore";
import type { CleanupPreviewItem, CleanupPreviewResult } from "@/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Database, Folder, Tag } from "lucide-react";
import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const preloadIo = () => import("@/lib/io");

type CleanupKind = "directories" | "tags";

interface CleanupDialogState {
  kind: CleanupKind | null;
  items: CleanupPreviewItem[];
  isConfirming: boolean;
}

interface SettingItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
  rightElement?: React.ReactNode;
}

interface CleanupPreviewDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  items: CleanupPreviewItem[];
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The route configuration for the data settings page.
 */
export const Route = createFileRoute("/settings/data")({
  component: () => <DataSettings />,
});

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

/** Shows the list of items that will be deleted before confirming cleanup. */
function CleanupPreviewDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  items,
  isConfirming,
  onConfirm,
  onCancel,
}: CleanupPreviewDialogProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex animate-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200 fade-in">
      <div className="w-full max-w-xl animate-in rounded-2xl bg-background p-6 shadow-2xl duration-200 zoom-in-95">
        <h3 className="mb-2 text-xl font-bold">{title}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        <div className="mb-6 max-h-80 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3">
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg bg-background px-3 py-2 text-foreground shadow-sm"
              >
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="rounded-xl bg-muted px-4 py-3 font-semibold transition-all duration-200 hover:bg-muted/80 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className="rounded-xl bg-accent px-4 py-3 font-semibold transition-all duration-200 hover:brightness-95 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isConfirming ? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The data settings page component.
 * Allows users to import, export, and clean up note data.
 */
const DataSettings = () => {
  const { t } = useTranslation();
  const [importProgress, setImportProgress] = useState<IoProgress | null>(null);
  const [exportProgress, setExportProgress] = useState<IoProgress | null>(null);
  const [activePreviewKind, setActivePreviewKind] =
    useState<CleanupKind | null>(null);
  const [dialogState, setDialogState] = useState<CleanupDialogState>({
    kind: null,
    items: [],
    isConfirming: false,
  });

  const isImporting = importProgress !== null;
  const isExporting = exportProgress !== null;
  const isCleaning = dialogState.isConfirming;
  const isBusy =
    isImporting || isExporting || activePreviewKind !== null || isCleaning;

  const handleImport = useCallback(async () => {
    setImportProgress({ current: 0, total: 0, phase: "scanning" });
    try {
      const { importMarkdownFolder } = await import("@/lib/io");
      const store = useStore.getState();
      const count = await importMarkdownFolder(store, setImportProgress);
      if (count > 0) {
        toast.success(
          t("settings.general.data.import.success", {
            count,
            defaultValue: `Imported ${count} notes successfully.`,
          }),
        );
      }
    } finally {
      setImportProgress(null);
    }
  }, [t]);

  const handleImportFiles = useCallback(async () => {
    setImportProgress({ current: 0, total: 0, phase: "scanning" });
    try {
      const { importMarkdownFiles } = await import("@/lib/io");
      const store = useStore.getState();
      const count = await importMarkdownFiles(store, setImportProgress);
      if (count > 0) {
        toast.success(
          t("settings.general.data.importFiles.success", {
            count,
            defaultValue: `Imported ${count} markdown files successfully.`,
          }),
        );
      }
    } finally {
      setImportProgress(null);
    }
  }, [t]);

  const handleExport = useCallback(async () => {
    setExportProgress({ current: 0, total: 0, phase: "scanning" });
    try {
      const { exportToMarkdownFolder } = await import("@/lib/io");
      const count = await exportToMarkdownFolder(setExportProgress);
      if (count > 0) {
        toast.success(
          t("settings.general.data.export.success", {
            count,
            defaultValue: `Exported ${count} notes successfully.`,
          }),
        );
      }
    } finally {
      setExportProgress(null);
    }
  }, [t]);

  const getProgressLabel = (progress: IoProgress) => {
    if (progress.phase === "scanning") {
      return t("settings.general.data.progress.scanning", "Scanning files...");
    }
    if (progress.phase === "saving") {
      return t(
        "settings.general.data.progress.saving",
        "Saving to database...",
      );
    }
    return t("settings.general.data.progress.processing", {
      current: progress.current,
      total: progress.total,
      defaultValue: `Processing ${progress.current} of ${progress.total}...`,
    });
  };

  const getProgressValue = (progress: IoProgress) => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  const closeCleanupDialog = useCallback(() => {
    setDialogState({ kind: null, items: [], isConfirming: false });
  }, []);

  const handlePreviewCleanup = useCallback(
    async (kind: CleanupKind) => {
      setActivePreviewKind(kind);

      try {
        const result: CleanupPreviewResult =
          kind === "directories"
            ? await previewEmptyDirectoriesAction()
            : await previewUnusedTagsAction();

        if (result.items.length === 0) {
          toast.success(
            t(
              `settings.general.data.cleanup${kind === "directories" ? "Directories" : "Tags"}.success`,
              {
                count: 0,
              },
            ),
          );
          return;
        }

        setDialogState({ kind, items: result.items, isConfirming: false });
      } catch {
        toast.error(
          t(
            `settings.general.data.cleanup${kind === "directories" ? "Directories" : "Tags"}.error`,
          ),
        );
      } finally {
        setActivePreviewKind(null);
      }
    },
    [t],
  );

  const handleConfirmCleanup = useCallback(async () => {
    if (!dialogState.kind) {
      return;
    }

    setDialogState((current) => ({ ...current, isConfirming: true }));

    try {
      const deletedCount =
        dialogState.kind === "directories"
          ? await useStore.getState().cleanupEmptyDirectories()
          : await useStore.getState().cleanupUnusedTags();

      toast.success(
        t(
          `settings.general.data.cleanup${dialogState.kind === "directories" ? "Directories" : "Tags"}.success`,
          {
            count: deletedCount,
          },
        ),
      );
      closeCleanupDialog();
    } catch {
      toast.error(
        t(
          `settings.general.data.cleanup${dialogState.kind === "directories" ? "Directories" : "Tags"}.error`,
        ),
      );
      setDialogState((current) => ({ ...current, isConfirming: false }));
    }
  }, [closeCleanupDialog, dialogState.kind, t]);

  const cleanupDialogTitle =
    dialogState.kind === "directories"
      ? t(
          "settings.general.data.cleanupDirectories.previewTitle",
          "Delete Empty Folders",
        )
      : t(
          "settings.general.data.cleanupTags.previewTitle",
          "Delete Unused Tags",
        );

  const cleanupDialogDescription =
    dialogState.kind === "directories"
      ? t("settings.general.data.cleanupDirectories.previewDescription", {
          count: dialogState.items.length,
          defaultValue: `The following ${dialogState.items.length} folders will be deleted.`,
        })
      : t("settings.general.data.cleanupTags.previewDescription", {
          count: dialogState.items.length,
          defaultValue: `The following ${dialogState.items.length} tags will be deleted.`,
        });

  const cleanupConfirmLabel = dialogState.isConfirming
    ? t("common.cleaning", "Cleaning...")
    : dialogState.kind === "directories"
      ? t(
          "settings.general.data.cleanupDirectories.confirmAction",
          "Delete Folders",
        )
      : t("settings.general.data.cleanupTags.confirmAction", "Delete Tags");

  return (
    <>
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
              <Database className="text-foreground" size={24} />
            </div>
            <h1 className="text-2xl font-bold">
              {t("settings.general.data.title")}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "settings.general.data.description",
              "Manage your note data, including importing from and exporting to Markdown files.",
            )}
          </p>
        </header>

        <section>
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            {t("settings.general.data.title", "Data Management")}
          </h3>

          <SettingItem
            icon={Folder}
            title={t(
              "settings.general.data.import.title",
              "Import Markdown Folder",
            )}
            description={t(
              "settings.general.data.import.description",
              "Import nested markdown files from a local directory into your notes.",
            )}
          >
            <button
              type="button"
              onClick={handleImport}
              onMouseEnter={preloadIo}
              onFocus={preloadIo}
              disabled={isBusy}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting
                ? t("common.importing", "Importing...")
                : t("common.import", "Import")}
            </button>
          </SettingItem>

          <SettingItem
            icon={Folder}
            title={t(
              "settings.general.data.importFiles.title",
              "Import Markdown Files",
            )}
            description={t(
              "settings.general.data.importFiles.description",
              "Select one or more local markdown files to import directly into your notes.",
            )}
          >
            <button
              type="button"
              onClick={handleImportFiles}
              onMouseEnter={preloadIo}
              onFocus={preloadIo}
              disabled={isBusy}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImporting
                ? t("common.importing", "Importing...")
                : t("common.import", "Import")}
            </button>
          </SettingItem>

          {importProgress && (
            <div className="mb-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs text-muted-foreground">
                {getProgressLabel(importProgress)}
              </p>
              <Progress value={getProgressValue(importProgress)} />
            </div>
          )}

          <SettingItem
            icon={Folder}
            title={t(
              "settings.general.data.export.title",
              "Export to Markdown",
            )}
            description={t(
              "settings.general.data.export.description",
              "Export all your notes to a local directory as markdown files.",
            )}
          >
            <button
              type="button"
              onClick={handleExport}
              onMouseEnter={preloadIo}
              onFocus={preloadIo}
              disabled={isBusy}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting
                ? t("common.exporting", "Exporting...")
                : t("common.export", "Export")}
            </button>
          </SettingItem>

          {exportProgress && (
            <div className="mb-3 rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs text-muted-foreground">
                {getProgressLabel(exportProgress)}
              </p>
              <Progress value={getProgressValue(exportProgress)} />
            </div>
          )}

          <SettingItem
            icon={Folder}
            title={t(
              "settings.general.data.cleanupDirectories.title",
              "Clear Empty Folders",
            )}
            description={t(
              "settings.general.data.cleanupDirectories.description",
              "Delete folders that do not contain notes anywhere in their subtree.",
            )}
          >
            <button
              type="button"
              onClick={() => void handlePreviewCleanup("directories")}
              disabled={isBusy}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activePreviewKind === "directories"
                ? t("common.loading", "Loading...")
                : t("settings.general.data.cleanupDirectories.action", "Clear")}
            </button>
          </SettingItem>

          <SettingItem
            icon={Tag}
            title={t(
              "settings.general.data.cleanupTags.title",
              "Clear Unused Tags",
            )}
            description={t(
              "settings.general.data.cleanupTags.description",
              "Delete tags that are not associated with any notes.",
            )}
          >
            <button
              type="button"
              onClick={() => void handlePreviewCleanup("tags")}
              disabled={isBusy}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activePreviewKind === "tags"
                ? t("common.loading", "Loading...")
                : t("settings.general.data.cleanupTags.action", "Clear")}
            </button>
          </SettingItem>
        </section>
      </div>

      <CleanupPreviewDialog
        isOpen={dialogState.kind !== null}
        title={cleanupDialogTitle}
        description={cleanupDialogDescription}
        confirmLabel={cleanupConfirmLabel}
        cancelLabel={t("common.cancel")}
        items={dialogState.items}
        isConfirming={dialogState.isConfirming}
        onConfirm={() => void handleConfirmCleanup()}
        onCancel={closeCleanupDialog}
      />
    </>
  );
};
