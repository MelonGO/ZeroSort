import { CreatedAtEditor } from "@/components/editor/CreatedAtEditor";
import { Regenerate } from "@/components/editor/Regenerate";
import { UnsavedChangesDialog } from "@/components/editor/UnsavedChangesDialog";
import { BacklinksPanel } from "@/components/notes/BacklinksPanel";
import { MoveNoteModal } from "@/components/notes/MoveNoteModal";
import { OutgoingLinksPanel } from "@/components/notes/OutgoingLinksPanel";
import { TagPicker } from "@/components/notes/TagPicker";
import { CharacterCount } from "@/components/tiptap/CharacterCount";
import { TiptapEditor } from "@/components/tiptap/TiptapEditor";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useLoadNoteContent } from "@/hooks/useLoadNoteContent";
import { useNoteActions } from "@/hooks/useNoteActions";
import { useRegisterSaveCallback } from "@/hooks/useRegisterSaveCallback";
import { saveNoteAction } from "@/lib/actions";
import { findNoteByTitle } from "@/lib/db/noteLinks";
import {
  discardPendingManagedImageFiles,
  extractManagedImagePathsFromContent,
} from "@/lib/images";
import { resolveTagIdsFromNames } from "@/lib/tagNames";
import { getDirectoryPathResolver } from "@/store/helpers";
import {
  getNoteContentFromStore,
  setNoteContentInStore,
} from "@/store/slices/notes";
import { useStore } from "@/store/useStore";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Check,
  ChevronDown,
  Clock,
  Edit2,
  EyeOff,
  Folder,
  Link2,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

interface EditState {
  tempTitle: string;
  tempSummary: string;
  hasContentChanged: boolean;
  isEditingTitle: boolean;
  isEditingSummary: boolean;
  isSaving: boolean;
}

type EditAction =
  | { type: "SET_TEMP_TITLE"; value: string }
  | { type: "SET_TEMP_SUMMARY"; value: string }
  | { type: "SET_CONTENT_CHANGED"; value: boolean }
  | { type: "SET_EDITING_TITLE"; value: boolean }
  | { type: "SET_EDITING_SUMMARY"; value: boolean }
  | { type: "SET_SAVING"; value: boolean }
  | {
      type: "SYNC_FROM_NOTE";
      title: string;
      summary: string;
    }
  | { type: "SAVE_COMPLETE" };

const initialEditState: EditState = {
  tempTitle: "",
  tempSummary: "",
  hasContentChanged: false,
  isEditingTitle: false,
  isEditingSummary: false,
  isSaving: false,
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function updateStateIfChanged<K extends keyof EditState>(
  state: EditState,
  key: K,
  value: EditState[K],
): EditState {
  if (Object.is(state[key], value)) {
    return state;
  }

  return { ...state, [key]: value };
}

function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "SET_TEMP_TITLE":
      return updateStateIfChanged(state, "tempTitle", action.value);
    case "SET_TEMP_SUMMARY":
      return updateStateIfChanged(state, "tempSummary", action.value);
    case "SET_CONTENT_CHANGED":
      return updateStateIfChanged(state, "hasContentChanged", action.value);
    case "SET_EDITING_TITLE":
      return updateStateIfChanged(state, "isEditingTitle", action.value);
    case "SET_EDITING_SUMMARY":
      return updateStateIfChanged(state, "isEditingSummary", action.value);
    case "SET_SAVING":
      return updateStateIfChanged(state, "isSaving", action.value);
    case "SYNC_FROM_NOTE": {
      if (
        state.tempTitle === action.title &&
        state.tempSummary === action.summary &&
        state.hasContentChanged === false
      ) {
        return state;
      }

      return {
        ...state,
        tempTitle: action.title,
        tempSummary: action.summary,
        hasContentChanged: false,
      };
    }
    case "SAVE_COMPLETE":
      if (
        state.isEditingTitle === false &&
        state.isEditingSummary === false &&
        state.hasContentChanged === false &&
        state.isSaving === false
      ) {
        return state;
      }

      return {
        ...state,
        isEditingTitle: false,
        isEditingSummary: false,
        hasContentChanged: false,
        isSaving: false,
      };
    default:
      return state;
  }
}

/**
 * Main component for viewing and editing the details of a selected note.
 *
 * @returns A full-screen or pane-based note editor and viewer.
 */
export function NoteViewer() {
  const [editor, setEditor] = useState<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLinks, setShowLinks] = useState(false);
  const { t } = useTranslation();
  const {
    directories,
    allTags,
    selectedNoteId,
    pendingNoteId,
    pendingCloseNoteId,
    showSummary,
    currentNoteBacklinks,
    currentNoteOutgoingLinks,
  } = useStore(
    useShallow((state) => ({
      directories: state.directories,
      allTags: state.tags,
      selectedNoteId: state.selectedNoteId,
      pendingNoteId: state.pendingNoteId,
      pendingCloseNoteId: state.pendingCloseNoteId,
      showSummary: state.showSummary,
      currentNoteBacklinks: state.currentNoteBacklinks,
      currentNoteOutgoingLinks: state.currentNoteOutgoingLinks,
    })),
  );
  const setSelectedNoteId = useStore((state) => state.setSelectedNoteId);
  const confirmNoteSelection = useStore((state) => state.confirmNoteSelection);
  const updateNote = useStore((state) => state.updateNote);
  const setHasUnsavedChanges = useStore((state) => state.setHasUnsavedChanges);
  const cancelNoteSelection = useStore((state) => state.cancelNoteSelection);
  const closeNote = useStore((state) => state.closeNote);
  const cancelCloseNote = useStore((state) => state.cancelCloseNote);
  const toggleSummary = useStore((state) => state.toggleSummary);
  const setNoteTagIds = useStore((state) => state.setNoteTagIds);
  const loadNoteLinks = useStore((state) => state.loadNoteLinks);
  const note = useStore((state) =>
    selectedNoteId ? (state.notesById.get(selectedNoteId) ?? null) : null,
  );
  const isContentLoaded = useStore((state) =>
    selectedNoteId
      ? (state.notesById.get(selectedNoteId)?.isContentLoaded ?? false)
      : false,
  );
  // Subscribe to contentVersion to re-render when content is loaded/saved (content itself lives outside Zustand)
  const contentVersion = useStore((state) =>
    selectedNoteId
      ? (state.notesById.get(selectedNoteId)?.contentVersion ?? 0)
      : 0,
  );
  const tagsMap = useMemo(
    () => new Map(allTags.map((t) => [t.id, t])),
    [allTags],
  );
  const {
    isRegeneratingTitle,
    isRegeneratingSummary,
    isRegeneratingDirectory,
  } = useNoteActions();
  const [editState, dispatch] = useReducer(editReducer, initialEditState);
  const {
    tempTitle,
    tempSummary,
    hasContentChanged,
    isEditingTitle,
    isEditingSummary,
    isSaving,
  } = editState;
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);

  const isContentLoading = useLoadNoteContent(
    note ? selectedNoteId : null,
    isContentLoaded,
  );

  const isAnyRegenerating =
    isRegeneratingTitle || isRegeneratingSummary || isRegeneratingDirectory;
  const directoryPathResolver = useMemo(
    () => getDirectoryPathResolver(directories),
    [directories],
  );
  const directoryPathLabel = useMemo(() => {
    if (!note?.directoryId) {
      return t("common.uncategorized");
    }

    return directoryPathResolver.getPathLabel(note.directoryId);
  }, [directoryPathResolver, note?.directoryId, t]);

  // Stable callbacks for child components — dispatch is stable from useReducer
  const handleEditorChange = useCallback(() => {
    dispatch({ type: "SET_CONTENT_CHANGED", value: true });
  }, []);

  const handleRegenerateMetadataApply = useCallback(
    async ({ title, summary }: { title?: string; summary?: string }) => {
      if (!selectedNoteId || !note) {
        return;
      }

      const latestNote =
        useStore.getState().notesById.get(selectedNoteId) ?? note;
      const nextTitle = title ?? latestNote.title;
      const nextSummary = summary ?? latestNote.summary;
      const hasTitleChange = nextTitle !== latestNote.title;
      const hasSummaryChange = nextSummary !== latestNote.summary;

      if (!hasTitleChange && !hasSummaryChange) {
        if (title !== undefined) {
          dispatch({ type: "SET_TEMP_TITLE", value: nextTitle });
        }
        if (summary !== undefined) {
          dispatch({ type: "SET_TEMP_SUMMARY", value: nextSummary });
        }
        return;
      }

      try {
        const updatedAt = new Date().toISOString();
        const storeUpdates: Partial<typeof latestNote> = { updatedAt };
        if (hasTitleChange) {
          storeUpdates.title = nextTitle;
        }
        if (hasSummaryChange) {
          storeUpdates.summary = nextSummary;
        }

        const noteForDb = {
          ...latestNote,
          ...storeUpdates,
          content: getNoteContentFromStore(selectedNoteId),
        };
        const result = await saveNoteAction(noteForDb);
        updateNote(selectedNoteId, storeUpdates);
        if (title !== undefined) {
          dispatch({ type: "SET_TEMP_TITLE", value: nextTitle });
        }
        if (summary !== undefined) {
          dispatch({ type: "SET_TEMP_SUMMARY", value: nextSummary });
        }

        if (result.warnings.length > 0) {
          toast.warning(t("note.savedWithWarnings"));
        }
      } catch (error) {
        console.error("Failed to persist regenerated note metadata:", error);
        toast.error(getErrorMessage(error, t("note.failedToSave")));
        throw error;
      }
    },
    [note, selectedNoteId, t, updateNote],
  );

  const handleAITagsUpdate = useCallback(
    async (tagNames: string[]) => {
      if (!selectedNoteId) {
        return;
      }

      const tagIds = await resolveTagIdsFromNames({
        tagNames,
        tags: useStore.getState().tags,
        addTag: useStore.getState().addTag,
      });
      await setNoteTagIds(selectedNoteId, tagIds);
    },
    [selectedNoteId, setNoteTagIds],
  );

  const handleCloseMoveModal = useCallback(() => {
    setIsMoveModalOpen(false);
  }, []);

  const handleCloseAIModal = useCallback(() => {
    setIsAIModalOpen(false);
  }, []);

  const isDirty = note
    ? tempTitle !== note.title ||
      tempSummary !== note.summary ||
      hasContentChanged
    : false;

  /**
   * Saves the current note's content, title, and summary to the database.
   * Resets unsaved changes state upon success.
   */
  const handleSave = async (): Promise<boolean> => {
    if (!editor || !selectedNoteId || !note) {
      return false;
    }

    dispatch({ type: "SET_SAVING", value: true });

    try {
      const content = hasContentChanged
        ? JSON.stringify(editor.getJSON())
        : getNoteContentFromStore(selectedNoteId);
      const updatedAt = new Date().toISOString();
      const latestNote =
        useStore.getState().notesById.get(selectedNoteId) ?? note;

      // Build metadata-only updates for Zustand store
      const storeUpdates: Partial<typeof note> = { updatedAt };
      if (tempTitle !== note.title) storeUpdates.title = tempTitle;
      if (tempSummary !== note.summary) storeUpdates.summary = tempSummary;
      if (hasContentChanged) {
        storeUpdates.contentVersion = (note.contentVersion ?? 0) + 1;
      }

      // saveNoteAction needs the full note with content for DB persistence
      const noteForDb = { ...latestNote, ...storeUpdates, content };

      // Extract image paths from old content to avoid re-reading from DB
      const previousImagePaths = hasContentChanged
        ? extractManagedImagePathsFromContent(
            getNoteContentFromStore(selectedNoteId),
            selectedNoteId,
          )
        : undefined;

      const result = await saveNoteAction(
        noteForDb,
        undefined,
        previousImagePaths,
      );

      // Store content outside Zustand, only bump version in store
      if (hasContentChanged) {
        setNoteContentInStore(selectedNoteId, content);
      }
      updateNote(selectedNoteId, storeUpdates);

      dispatch({ type: "SAVE_COMPLETE" });
      if (result.warnings.length > 0) {
        toast.warning(t("note.savedWithWarnings"));
      } else {
        toast.success(t("note.savedSuccessfully"));
      }

      if (pendingNoteId !== undefined) {
        setSelectedNoteId(pendingNoteId);
      }

      if (pendingCloseNoteId !== undefined) {
        cancelCloseNote();
        closeNote(pendingCloseNoteId);
      }

      return true;
    } catch (error) {
      console.error("Failed to save note:", error);
      toast.error(getErrorMessage(error, t("note.failedToSave")));
      return false;
    } finally {
      dispatch({ type: "SET_SAVING", value: false });
    }
  };

  const handleTitleSubmit = () => {
    if (tempTitle.trim() && selectedNoteId) {
      dispatch({ type: "SET_EDITING_TITLE", value: false });
    }
  };

  const handleSummarySubmit = () => {
    if (selectedNoteId) {
      dispatch({ type: "SET_EDITING_SUMMARY", value: false });
    }
  };

  const handleDiscard = useCallback(async () => {
    if (!selectedNoteId) {
      return;
    }

    try {
      await discardPendingManagedImageFiles(selectedNoteId);
    } catch (error) {
      console.error("Failed to discard pending managed images:", error);
    }
  }, [selectedNoteId]);

  // Register a stable save callback in the store for external callers (e.g. route blocker)
  useRegisterSaveCallback(handleSave);

  // Sync store's unsaved state from derived isDirty
  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => {
      setHasUnsavedChanges(false);
    };
  }, [isDirty, setHasUnsavedChanges]);

  // Prevent browser close when there are unsaved changes
  useBeforeUnloadGuard(isDirty);

  // Batch-sync editing state when the selected note changes
  useEffect(() => {
    if (note) {
      dispatch({
        type: "SYNC_FROM_NOTE",
        title: note.title,
        summary: note.summary,
      });
    }
  }, [note?.id]);

  // Load note links when note is selected
  useEffect(() => {
    if (selectedNoteId) {
      loadNoteLinks(selectedNoteId);
    }
  }, [selectedNoteId, loadNoteLinks]);

  // Fetch all notes for wiki link autocomplete
  const fetchNotesForAutocomplete = useCallback(async () => {
    return Array.from(useStore.getState().notesById.values());
  }, []);

  // Handler for wiki link clicks
  const handleWikiLinkClick = useCallback(
    async (noteTitle: string) => {
      try {
        const targetNote = await findNoteByTitle(noteTitle);
        if (targetNote) {
          confirmNoteSelection(targetNote.id);
        } else {
          toast.error(t("links.noteNotFound", `Note "${noteTitle}" not found`));
        }
      } catch (error) {
        console.error("Failed to navigate to linked note:", error);
        toast.error(t("links.navigationError", "Failed to navigate to note"));
      }
    },
    [confirmNoteSelection, t],
  );

  // Handler for backlink clicks
  const handleBacklinkClick = useCallback(
    (noteId: string) => {
      confirmNoteSelection(noteId);
    },
    [confirmNoteSelection],
  );

  if (!note) return null;

  const totalLinks =
    currentNoteBacklinks.length + currentNoteOutgoingLinks.length;

  return (
    <div className="flex h-full w-full flex-col bg-background shadow-xl lg:shadow-none">
      <div className="flex flex-col border-b border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={tempTitle}
                  onChange={(e) =>
                    dispatch({ type: "SET_TEMP_TITLE", value: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleSubmit();
                    if (e.key === "Escape") {
                      dispatch({ type: "SET_TEMP_TITLE", value: note.title });
                      dispatch({ type: "SET_EDITING_TITLE", value: false });
                    }
                  }}
                  className="w-full border-b-2 border-primary bg-transparent text-xl font-bold outline-none"
                  autoFocus
                />
                <button
                  onClick={handleTitleSubmit}
                  className="rounded p-1 text-primary hover:bg-accent hover:text-accent-foreground"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    dispatch({ type: "SET_TEMP_TITLE", value: note.title });
                    dispatch({ type: "SET_EDITING_TITLE", value: false });
                  }}
                  className="rounded p-1 text-destructive hover:bg-accent hover:text-accent-foreground"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="group flex items-center space-x-1">
                <h2 className="truncate text-xl font-bold">{tempTitle}</h2>
                <button
                  onClick={() =>
                    dispatch({ type: "SET_EDITING_TITLE", value: true })
                  }
                  disabled={isAnyRegenerating}
                  className="rounded p-1 transition-all group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title={t("note.editTitle")}
                >
                  <Edit2 size={20} className="text-muted-foreground" />
                </button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center space-x-2">
            <button
              onClick={handleSave}
              disabled={isSaving || isAnyRegenerating || isContentLoading}
              className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={t("common.save")}
            >
              <Save
                size={18}
                className={isSaving ? "animate-pulse text-primary" : ""}
              />
              <span className="hidden sm:inline uppercase">
                {t("common.save")}
              </span>
            </button>
            <button
              onClick={() => setShowLinks(!showLinks)}
              className="relative flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              title={
                showLinks
                  ? t("links.hide", "Hide Links")
                  : t("links.show", "Show Links")
              }
            >
              <Link2 size={18} />
              {totalLinks > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  {totalLinks}
                </span>
              )}
              <span className="hidden sm:inline uppercase">
                {t("links.title", "Links")}
              </span>
            </button>
            <button
              onClick={toggleSummary}
              className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              title={
                showSummary ? t("note.hideSummary") : t("note.showSummary")
              }
            >
              {showSummary ? (
                <ArrowDownToLine size={18} />
              ) : (
                <ArrowUpToLine size={18} />
              )}
              <span className="hidden sm:inline uppercase">
                {t("note.summary")}
              </span>
            </button>
            <button
              onClick={() => setIsAIModalOpen(true)}
              className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              title={t("note.sort")}
            >
              <Sparkles size={18} />
              <span className="hidden sm:inline uppercase">
                {t("note.sort")}
              </span>
            </button>
            <button
              onClick={() => confirmNoteSelection(null)}
              className="flex items-center space-x-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              title={t("common.hide")}
            >
              <EyeOff size={18} />
              <span className="hidden sm:inline uppercase">
                {t("common.hide")}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <CreatedAtEditor note={note} />
          {note.updatedAt && (
            <span className="flex items-center">
              <Clock size={20} className="mr-1 text-primary" />{" "}
              {t("note.updated")}: {new Date(note.updatedAt).toLocaleString()}
            </span>
          )}
          <div className="group relative flex items-center">
            <Folder size={20} className="mr-1" />
            <button
              onClick={() => setIsMoveModalOpen(true)}
              disabled={isAnyRegenerating}
              className="group/move flex items-center space-x-1 rounded-lg px-2 py-1 transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="font-medium">{directoryPathLabel}</span>
              <ChevronDown
                size={20}
                className="text-muted-foreground transition-colors group-hover/move:text-foreground"
              />
            </button>
          </div>
          <div className="flex w-full flex-wrap items-center gap-1">
            {(note.tagIds ?? []).map((tagId) => {
              const tag = tagsMap.get(tagId);
              if (!tag) return null;
              return (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full border border-muted bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag.color && (
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => {
                      const newIds = (note.tagIds ?? []).filter(
                        (id) => id !== tagId,
                      );
                      setNoteTagIds(note.id, newIds);
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
            <TagPicker
              tagIds={note.tagIds ?? []}
              onTagsChange={(newIds) => setNoteTagIds(note.id, newIds)}
            />
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex h-full w-full flex-1 flex-col overflow-hidden"
      >
        {isContentLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <RefreshCw className="animate-spin text-primary" size={32} />
          </div>
        )}
        <TiptapEditor
          noteId={note.id}
          content={getNoteContentFromStore(note.id)}
          onChange={handleEditorChange}
          onEditorReady={setEditor}
          showModelSelect={true}
          onWikiLinkClick={handleWikiLinkClick}
          fetchNotes={fetchNotesForAutocomplete}
        />
      </div>

      {showSummary && (
        <div className="border-t border-border bg-muted p-3">
          <div className="mb-2 flex items-center">
            <h3 className="text-xs font-semibold tracking-wider uppercase">
              {t("note.summary")}
            </h3>
            {!isEditingSummary && (
              <button
                onClick={() =>
                  dispatch({ type: "SET_EDITING_SUMMARY", value: true })
                }
                disabled={isAnyRegenerating}
                className="rounded p-1 transition-colors hover:bg-background/50 disabled:cursor-not-allowed disabled:opacity-50"
                title={t("note.editSummary")}
              >
                <Edit2 size={20} className="text-muted-foreground" />
              </button>
            )}
          </div>

          {isEditingSummary ? (
            <div className="space-y-2">
              <textarea
                value={tempSummary}
                onChange={(e) =>
                  dispatch({ type: "SET_TEMP_SUMMARY", value: e.target.value })
                }
                className="min-h-20 w-full rounded-lg border border-input bg-transparent p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                placeholder={t("note.summaryPlaceholder")}
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    dispatch({ type: "SET_TEMP_SUMMARY", value: note.summary });
                    dispatch({ type: "SET_EDITING_SUMMARY", value: false });
                  }}
                  className="flex items-center rounded px-2 py-1 text-xs hover:bg-background/50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSummarySubmit}
                  className="flex items-center rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  <Check size={20} className="mr-1" /> {t("common.save")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-snug text-muted-foreground italic">
              {tempSummary}
            </p>
          )}
        </div>
      )}

      {showLinks && (
        <div className="grid grid-cols-2 gap-4 border-t border-border bg-muted/30">
          <div className="max-h-[30vh] overflow-y-auto border-r border-border">
            <OutgoingLinksPanel
              links={currentNoteOutgoingLinks}
              onLinkClick={handleBacklinkClick}
            />
          </div>
          <div className="max-h-[30vh] overflow-y-auto">
            <BacklinksPanel
              backlinkGroups={currentNoteBacklinks}
              onBacklinkClick={handleBacklinkClick}
            />
          </div>
        </div>
      )}

      {editor && <CharacterCount editor={editor} />}

      <MoveNoteModal
        isOpen={isMoveModalOpen}
        onClose={handleCloseMoveModal}
        noteId={note.id}
        currentDirectoryId={note.directoryId}
      />

      <Regenerate
        isOpen={isAIModalOpen}
        onClose={handleCloseAIModal}
        content={editor ? editor.getMarkdown() : ""}
        onMetadataApply={handleRegenerateMetadataApply}
        onTagsUpdate={handleAITagsUpdate}
        noteId={note.id}
        currentTitle={note.title}
        currentSummary={note.summary}
        currentDirectoryPath={
          note.directoryId
            ? directoryPathResolver.getPath(note.directoryId)
            : []
        }
        currentTagNames={(note.tagIds ?? [])
          .map((id) => tagsMap.get(id)?.name)
          .filter((n): n is string => !!n)}
      />

      {pendingNoteId !== undefined && (
        <UnsavedChangesDialog
          isOpen
          isSaving={isSaving}
          onSave={handleSave}
          onDiscard={async () => {
            await handleDiscard();
            setSelectedNoteId(pendingNoteId as string | null);
          }}
          onCancel={cancelNoteSelection}
        />
      )}

      {pendingCloseNoteId !== undefined && pendingNoteId === undefined && (
        <UnsavedChangesDialog
          isOpen
          isSaving={isSaving}
          onSave={handleSave}
          onDiscard={async () => {
            await handleDiscard();
            setHasUnsavedChanges(false);
            cancelCloseNote();
            closeNote(pendingCloseNoteId);
          }}
          onCancel={cancelCloseNote}
        />
      )}
    </div>
  );
}
