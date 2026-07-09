import { ModelSelectDropdown } from "@/components/editor/ModelSelectDropdown";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NoteSchema } from "@/hooks/useNoteActions";
import { useNoteActions } from "@/hooks/useNoteActions";
import { useStore } from "@/store/useStore";
import { RegenerateField } from "@/types";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderTree,
  Loader2,
  Sparkles,
  Tag,
  Type,
  X,
} from "lucide-react";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface RegenerateProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  onMetadataApply: (metadata: {
    title?: string;
    summary?: string;
  }) => Promise<void>;
  onTagsUpdate?: (tagNames: string[]) => void | Promise<void>;
  noteId: string;
  currentTitle: string;
  currentSummary: string;
  currentDirectoryPath: string[];
  currentTagNames?: string[];
}

type Phase = "select" | "review";

export const Regenerate: React.FC<RegenerateProps> = React.memo(
  function Regenerate({
    isOpen,
    onClose,
    content,
    onMetadataApply,
    onTagsUpdate,
    noteId,
    currentTitle,
    currentSummary,
    currentDirectoryPath,
    currentTagNames = [],
  }) {
    const { t } = useTranslation();
    const moveNote = useStore((state) => state.moveNote);
    const allTags = useStore((state) => state.tags);
    const includeExistingDirs = useStore((state) => state.includeExistingDirs);
    const setIncludeExistingDirs = useStore(
      (state) => state.setIncludeExistingDirs,
    );
    const {
      regenerate,
      cancelRegenerate,
      isRegeneratingTitle,
      isRegeneratingSummary,
      isRegeneratingDirectory,
      isRegeneratingTags,
    } = useNoteActions();

    const [selectedFields, setSelectedFields] = useState<
      Record<RegenerateField, boolean>
    >({
      title: true,
      summary: true,
      catalog: true,
      tags: true,
    });

    const [phase, setPhase] = useState<Phase>("select");
    const [pendingResult, setPendingResult] =
      useState<Partial<NoteSchema> | null>(null);
    const [reviewFields, setReviewFields] = useState<RegenerateField[]>([]);

    const isAnyRegenerating =
      isRegeneratingTitle ||
      isRegeneratingSummary ||
      isRegeneratingDirectory ||
      isRegeneratingTags;
    const selectedCount = Object.values(selectedFields).filter(Boolean).length;
    const hasPendingPreview =
      pendingResult !== null && Object.keys(pendingResult).length > 0;

    if (!isOpen) return null;

    /**
     * Resets the component state back to the selection phase.
     */
    const resetToSelectPhase = () => {
      cancelRegenerate();
      setPhase("select");
      setPendingResult(null);
      setReviewFields([]);
    };

    /**
     * Handles closing the modal and resetting all internal state.
     */
    const handleClose = () => {
      resetToSelectPhase();
      onClose();
    };

    /**
     * Triggers the AI regeneration process for the selected fields.
     * Instead of applying immediately, stores the result for review.
     */
    const handleRegenerate = async () => {
      if (!content) return;

      const fieldsToRegenerate = (
        Object.keys(selectedFields) as RegenerateField[]
      ).filter((key) => selectedFields[key]);

      if (fieldsToRegenerate.length === 0) {
        toast.error(t("note.selectToRegenerate"));
        return;
      }

      setReviewFields(fieldsToRegenerate);
      setPendingResult({});
      setPhase("review");

      const result = await regenerate(fieldsToRegenerate, content, {
        onPartialResult: (partialResult) => {
          setPendingResult((prev) => ({
            ...(prev ?? {}),
            ...partialResult,
          }));
        },
      });

      if (result) {
        // Normalize result into a Partial<NoteSchema> for the review phase
        let normalized: Partial<NoteSchema>;

        if (typeof result === "string") {
          // Single field returned as string
          const field = fieldsToRegenerate[0];
          normalized = {};
          if (field === "title") normalized.title = result;
          if (field === "summary") normalized.summary = result;
        } else if (Array.isArray(result)) {
          // Single catalog field returned as string[]
          normalized = { catalog: result };
        } else {
          normalized = result as Partial<NoteSchema>;
        }

        setPendingResult(normalized);
        return;
      }

      resetToSelectPhase();
    };

    /**
     * Applies the pending regeneration result to the note.
     */
    const handleApply = async () => {
      if (!pendingResult) return;

      try {
        if (pendingResult.title || pendingResult.summary) {
          await onMetadataApply({
            title: pendingResult.title,
            summary: pendingResult.summary,
          });
        }
        if (
          pendingResult.tags &&
          Array.isArray(pendingResult.tags) &&
          onTagsUpdate
        ) {
          await onTagsUpdate(pendingResult.tags);
        }
        if (pendingResult.catalog && Array.isArray(pendingResult.catalog)) {
          await moveNote(noteId, pendingResult.catalog);
        }
      } catch (error) {
        console.error("Failed to apply regenerated changes:", error);
        return;
      }

      toast.success(t("note.regeneratedSuccessfully"));
      handleClose();
    };

    /**
     * Toggles the selection state of a field.
     * @param field - The field identifier to toggle.
     */
    const toggleField = (field: RegenerateField) => {
      setSelectedFields((prev) => ({ ...prev, [field]: !prev[field] }));
    };

    /**
     * Returns a placeholder while a streamed field is still pending.
     */
    const getStreamingPlaceholder = (field: RegenerateField) => {
      if (!isAnyRegenerating || !reviewFields.includes(field)) {
        return "---";
      }

      return t("common.regenerating");
    };

    /**
     * Returns whether a selected field is still waiting for streamed output.
     */
    const isFieldStreaming = (field: RegenerateField) => {
      if (
        !isAnyRegenerating ||
        !reviewFields.includes(field) ||
        !pendingResult
      ) {
        return false;
      }

      const value = pendingResult[field];
      return value === undefined;
    };

    /**
     * Renders the field selection phase UI.
     */
    const renderSelectPhase = () => (
      <>
        {/* Field selection section */}
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("note.selectToRegenerate")}
            </p>

            <ModelSelectDropdown />
          </div>

          <div className="space-y-2">
            {[
              { id: "title" as const, icon: Type, label: t("common.title") },
              {
                id: "summary" as const,
                icon: FileText,
                label: t("note.summary"),
              },
              {
                id: "catalog" as const,
                icon: Folder,
                label: t("sidebar.folders"),
              },
              { id: "tags" as const, icon: Tag, label: t("common.tags") },
            ].map((field) => (
              <div key={field.id}>
                <button
                  type="button"
                  onClick={() => toggleField(field.id)}
                  className={`flex w-full items-center justify-between rounded-xl border-2 p-4 transition-all ${
                    selectedFields[field.id]
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <field.icon
                      size={20}
                      className={
                        selectedFields[field.id]
                          ? "text-primary"
                          : "text-muted-foreground"
                      }
                    />
                    <span
                      className={`font-medium ${selectedFields[field.id] ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {field.label}
                    </span>
                  </div>
                  {selectedFields[field.id] && (
                    <Check size={20} className="text-primary" />
                  )}
                </button>

                {/* Sub-option for catalog: include existing directories toggle */}
                {field.id === "catalog" && selectedFields.catalog && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() =>
                          setIncludeExistingDirs(!includeExistingDirs)
                        }
                        className="mt-1.5 ml-4 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg border border-muted bg-muted/30 px-3 py-2.5 transition-all hover:bg-muted/50"
                      >
                        <div className="flex items-center space-x-2">
                          <FolderTree
                            size={16}
                            className={
                              includeExistingDirs
                                ? "text-primary"
                                : "text-muted-foreground"
                            }
                          />
                          <span
                            className={`text-xs font-medium ${includeExistingDirs ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {t("ai.includeExistingDirs")}
                          </span>
                        </div>
                        <div
                          className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                            includeExistingDirs
                              ? "bg-primary"
                              : "bg-muted-foreground/30"
                          }`}
                        >
                          <div
                            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                              includeExistingDirs
                                ? "translate-x-4"
                                : "translate-x-0"
                            }`}
                          />
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="z-70">
                      <p className="text-xs">
                        {t("ai.includeExistingDirsTooltip")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer action buttons */}
        <div className="flex space-x-3 bg-muted/50 p-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isAnyRegenerating}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isAnyRegenerating || selectedCount === 0}
            className="flex flex-2 items-center justify-center space-x-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 disabled:bg-muted"
          >
            {isAnyRegenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{t("common.regenerating")}</span>
              </>
            ) : (
              <>
                <Sparkles size={18} />
                <span>{t("note.regenerateSelected")}</span>
              </>
            )}
          </button>
        </div>
      </>
    );

    /**
     * Renders a single field comparison row in the review phase.
     */
    const renderComparisonField = (
      icon: React.ElementType,
      label: string,
      currentValue: string,
      newValue: string,
      isStreaming = false,
    ) => {
      const hasChanged =
        currentValue.trim().toLowerCase() !== newValue.trim().toLowerCase();

      return (
        <div className="space-y-2 rounded-xl border-2 border-muted p-4">
          <div className="flex items-center space-x-2">
            {React.createElement(icon, {
              size: 18,
              className: "text-muted-foreground",
            })}
            <span className="text-sm font-semibold text-foreground">
              {label}
            </span>
            {!hasChanged && !isStreaming && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("note.noChange")}
              </span>
            )}
          </div>

          {/* Current value */}
          <div className="rounded-lg bg-muted/50 p-3">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("common.beforeUpdate")}
            </span>
            <p className="text-sm text-muted-foreground">
              {currentValue || "---"}
            </p>
          </div>

          {/* New value */}
          <div
            className={`relative overflow-hidden rounded-lg p-3 ${hasChanged ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/50"}`}
          >
            {isStreaming && (
              <div className="animate-shimmer absolute inset-0 bg-linear-to-r from-transparent via-primary/10 to-transparent" />
            )}
            <span
              className={`relative mb-1 block text-xs font-medium uppercase tracking-wider ${hasChanged ? "text-primary" : "text-muted-foreground"}`}
            >
              {t("common.afterUpdate")}
            </span>
            <p
              className={`relative text-sm ${isStreaming ? "animate-pulse" : ""} ${hasChanged ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {newValue || "---"}
            </p>
          </div>
        </div>
      );
    };

    /**
     * Renders tags using the same pill styling as the note viewer.
     */
    const renderTagList = (tagNames: string[], isChanged: boolean) => {
      if (tagNames.length === 0) {
        return <p className="text-sm text-muted-foreground">---</p>;
      }

      return (
        <div className="flex flex-wrap items-center gap-1">
          {tagNames.map((tagName) => {
            const existingTag = allTags.find((tag) => tag.name === tagName);

            return (
              <span
                key={tagName}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                  isChanged
                    ? "border-primary/20 bg-primary/10 text-foreground"
                    : "border-muted bg-muted/50 text-muted-foreground"
                }`}
              >
                {existingTag?.color && (
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: existingTag.color }}
                  />
                )}
                {tagName}
              </span>
            );
          })}
        </div>
      );
    };

    /**
     * Renders a tags comparison row using the note viewer tag style.
     */
    const renderTagsComparisonField = (
      label: string,
      currentTags: string[],
      newTags: string[],
      isStreaming = false,
    ) => {
      const currentValue = currentTags.join(", ").trim().toLowerCase();
      const newValue = newTags.join(", ").trim().toLowerCase();
      const hasChanged = currentValue !== newValue;

      return (
        <div className="space-y-2 rounded-xl border-2 border-muted p-4">
          <div className="flex items-center space-x-2">
            <Tag size={18} className="text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              {label}
            </span>
            {!hasChanged && !isStreaming && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t("note.noChange")}
              </span>
            )}
          </div>

          <div className="rounded-lg bg-muted/50 p-3">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("common.beforeUpdate")}
            </span>
            {renderTagList(currentTags, false)}
          </div>

          <div
            className={`relative overflow-hidden rounded-lg p-3 ${hasChanged ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/50"}`}
          >
            {isStreaming && (
              <div className="animate-shimmer absolute inset-0 bg-linear-to-r from-transparent via-primary/10 to-transparent" />
            )}
            <span
              className={`relative mb-1 block text-xs font-medium uppercase tracking-wider ${hasChanged ? "text-primary" : "text-muted-foreground"}`}
            >
              {t("common.afterUpdate")}
            </span>
            <div className={`relative ${isStreaming ? "animate-pulse" : ""}`}>
              {newTags.length > 0 ? (
                renderTagList(newTags, hasChanged)
              ) : isStreaming ? (
                <div className="flex flex-wrap gap-2">
                  <span className="h-6 w-18 rounded-full bg-primary/15" />
                  <span className="h-6 w-14 rounded-full bg-primary/10" />
                  <span className="h-6 w-20 rounded-full bg-primary/10" />
                </div>
              ) : (
                renderTagList(newTags, hasChanged)
              )}
            </div>
          </div>
        </div>
      );
    };

    /**
     * Renders the review phase UI with current vs. new value comparisons.
     */
    const renderReviewPhase = () => {
      if (!pendingResult) return null;

      const currentDirDisplay =
        currentDirectoryPath.length > 0
          ? currentDirectoryPath.join(" / ")
          : t("common.uncategorized");

      const newCatalogDisplay =
        pendingResult.catalog && pendingResult.catalog.length > 0
          ? pendingResult.catalog.join(" / ")
          : currentDirDisplay;

      return (
        <>
          {/* Review content */}
          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-6">
            {reviewFields.includes("title") &&
              renderComparisonField(
                Type,
                t("common.title"),
                currentTitle,
                pendingResult.title ?? getStreamingPlaceholder("title"),
                isFieldStreaming("title"),
              )}

            {reviewFields.includes("summary") &&
              renderComparisonField(
                FileText,
                t("note.summary"),
                currentSummary,
                pendingResult.summary ?? getStreamingPlaceholder("summary"),
                isFieldStreaming("summary"),
              )}

            {reviewFields.includes("catalog") && (
              <div className="space-y-2 rounded-xl border-2 border-muted p-4">
                <div className="flex items-center space-x-2">
                  <Folder size={18} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    {t("sidebar.folders")}
                  </span>
                  {currentDirDisplay === newCatalogDisplay &&
                    !isFieldStreaming("catalog") && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {t("note.noChange")}
                      </span>
                    )}
                </div>

                {/* Current directory path */}
                <div className="rounded-lg bg-muted/50 p-3">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("common.beforeUpdate")}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {currentDirectoryPath.length > 0 ? (
                      currentDirectoryPath.map((segment, i) => (
                        <React.Fragment
                          key={`cur-${currentDirectoryPath.slice(0, i + 1).join("/")}`}
                        >
                          {i > 0 && (
                            <ChevronRight
                              size={14}
                              className="text-muted-foreground"
                            />
                          )}
                          <span className="text-sm text-muted-foreground">
                            {segment}
                          </span>
                        </React.Fragment>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        {t("common.uncategorized")}
                      </span>
                    )}
                  </div>
                </div>

                {/* New directory path */}
                <div
                  className={`relative overflow-hidden rounded-lg p-3 ${
                    currentDirDisplay !== newCatalogDisplay
                      ? "bg-primary/5 ring-1 ring-primary/20"
                      : "bg-muted/50"
                  }`}
                >
                  {isFieldStreaming("catalog") && (
                    <div className="animate-shimmer absolute inset-0 bg-linear-to-r from-transparent via-primary/10 to-transparent" />
                  )}
                  <span
                    className={`relative mb-1 block text-xs font-medium uppercase tracking-wider ${
                      currentDirDisplay !== newCatalogDisplay
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {t("common.afterUpdate")}
                  </span>
                  <div
                    className={`relative flex flex-wrap items-center gap-1 ${
                      isFieldStreaming("catalog") ? "animate-pulse" : ""
                    }`}
                  >
                    {pendingResult.catalog &&
                    pendingResult.catalog.length > 0 ? (
                      pendingResult.catalog.map((segment, i) => (
                        <React.Fragment
                          key={`new-${pendingResult.catalog!.slice(0, i + 1).join("/")}`}
                        >
                          {i > 0 && (
                            <ChevronRight
                              size={14}
                              className={
                                currentDirDisplay !== newCatalogDisplay
                                  ? "text-primary/50"
                                  : "text-muted-foreground"
                              }
                            />
                          )}
                          <span
                            className={`text-sm ${
                              currentDirDisplay !== newCatalogDisplay
                                ? "font-medium text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {segment}
                          </span>
                        </React.Fragment>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        {getStreamingPlaceholder("catalog")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {reviewFields.includes("tags") &&
              renderTagsComparisonField(
                t("common.tags"),
                currentTagNames,
                pendingResult.tags ?? [],
                isFieldStreaming("tags"),
              )}
          </div>

          {/* Footer action buttons for review phase */}
          <div className="flex space-x-3 bg-muted/50 p-4">
            <button
              type="button"
              onClick={resetToSelectPhase}
              className="flex flex-1 items-center justify-center space-x-2 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft size={16} />
              <span>{t("note.discardRegeneration")}</span>
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isAnyRegenerating || !hasPendingPreview}
              className="flex flex-2 items-center justify-center space-x-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 disabled:bg-muted"
            >
              {isAnyRegenerating ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{t("common.regenerating")}</span>
                </>
              ) : (
                <>
                  <Check size={18} />
                  <span>{t("note.applyChanges")}</span>
                </>
              )}
            </button>
          </div>
        </>
      );
    };

    return createPortal(
      <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
        {/* Modal content */}
        <div
          className="flex w-full max-w-xl animate-in flex-col overflow-hidden rounded-2xl bg-background shadow-2xl duration-200 zoom-in-95"
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* Header section with title and close button */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="flex items-center space-x-2">
              <Sparkles size={20} className="text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                {phase === "select"
                  ? t("note.regenerate")
                  : t("note.reviewChanges")}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>

          {phase === "select" ? renderSelectPhase() : renderReviewPhase()}
        </div>
        <div className="absolute inset-0 -z-10" />
      </div>,
      document.body,
    );
  },
);
