import { useNoModelSelectedToast } from "@/hooks/useNoModelSelectedToast";
import {
  getDirectoriesAction,
  getNotesAction,
  getTagsAction,
  saveNoteAction,
} from "@/lib/actions";
import { streamRegenerateNoteFields } from "@/lib/ai/regenerate";
import {
  buildInitialExampleNote,
  INITIAL_EXAMPLE_NOTE_CATALOG,
  INITIAL_EXAMPLE_NOTE_STORAGE_KEY,
} from "@/lib/notes/initialExampleNote";
import { loadStore } from "@/lib/persistence";
import { setNoteContentInStore } from "@/store/slices/notes";
import { useStore } from "@/store/useStore";
import { Note, RegenerateField } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { useShallow } from "zustand/react/shallow";

export const noteSchema = z.object({
  title: z.string(),
  catalog: z.array(z.string()),
  summary: z.string(),
  tags: z.array(z.string()).optional(),
});

export type NoteSchema = z.infer<typeof noteSchema>;

async function shouldCreateInitialExampleNote(notes: Note[]) {
  if (notes.length > 0) {
    return false;
  }

  const store = await loadStore();
  const wasCreated = await store.get(INITIAL_EXAMPLE_NOTE_STORAGE_KEY);
  return wasCreated !== true;
}

async function markInitialExampleNoteCreated() {
  const store = await loadStore();
  await store.set(INITIAL_EXAMPLE_NOTE_STORAGE_KEY, true);
}

/**
 * A custom hook that provides actions and state for managing notes,
 * including AI-powered organization and settings management.
 *
 * @returns An object containing state variables and action functions for notes.
 */
export function useNoteActions() {
  const { t } = useTranslation();
  const showNoModelSelectedToast = useNoModelSelectedToast();
  const {
    isInitialized,
    isRegeneratingTitle,
    isRegeneratingSummary,
    isRegeneratingDirectory,
    isRegeneratingTags,
    activeConfigId,
    selectedModelId,
  } = useStore(
    useShallow((state) => ({
      isInitialized: state.isInitialized,
      isRegeneratingTitle: state.isRegeneratingTitle,
      isRegeneratingSummary: state.isRegeneratingSummary,
      isRegeneratingDirectory: state.isRegeneratingDirectory,
      isRegeneratingTags: state.isRegeneratingTags,
      activeConfigId: state.activeConfigId,
      selectedModelId: state.selectedModelId,
    })),
  );
  const [isLoading, setIsLoading] = useState(false);
  const regenerateAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (isInitialized) return;
      const { syncFromDb, sortBy } = useStore.getState();
      let [dbNotes, dbDirs, dbTags] = await Promise.all([
        getNotesAction(sortBy),
        getDirectoriesAction(),
        getTagsAction(),
      ]);

      let initialExampleNote: Note | null = null;

      if (await shouldCreateInitialExampleNote(dbNotes as Note[])) {
        const timestamp = new Date().toISOString();
        const note = buildInitialExampleNote(crypto.randomUUID(), timestamp);
        const { directoryId } = await saveNoteAction(
          note,
          INITIAL_EXAMPLE_NOTE_CATALOG,
        );

        initialExampleNote = { ...note, directoryId };
        setNoteContentInStore(
          initialExampleNote.id,
          initialExampleNote.content,
        );
        await markInitialExampleNoteCreated();

        [dbDirs, dbTags] = await Promise.all([
          getDirectoriesAction(),
          getTagsAction(),
        ]);
        dbNotes = [initialExampleNote];
      }

      syncFromDb(dbNotes as Note[], dbDirs as any, dbTags);

      if (initialExampleNote) {
        useStore.getState().confirmNoteSelection(initialExampleNote.id);
      }
    };
    fetchData().catch((error) => {
      console.error("Failed to initialize notes:", error);
    });
  }, [isInitialized]);

  /**
   * Creates and opens a new empty untitled note.
   */
  const createEmptyNote = async () => {
    setIsLoading(true);
    const timestamp = new Date().toISOString();
    const emptyNote: Note = {
      id: crypto.randomUUID(),
      title: t("note.untitled", "Untitled"),
      summary: "",
      content: JSON.stringify({ type: "doc", content: [] }),
      directoryId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      isContentLoaded: true,
      tagIds: [],
    };

    try {
      await saveNoteAction(emptyNote);
      setNoteContentInStore(emptyNote.id, emptyNote.content);
      useStore.getState().addNote(emptyNote);
    } catch (error) {
      console.error("Failed to create empty note:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const regenerate = async (
    fields: RegenerateField | RegenerateField[],
    content: string,
    options?: {
      abortSignal?: AbortSignal;
      onPartialResult?: (result: Partial<NoteSchema>) => void;
    },
  ) => {
    const {
      modelConfigs,
      activeConfigId,
      selectedModelId,
      includeExistingDirs,
      directories,
      setIsRegeneratingTitle,
      setIsRegeneratingSummary,
      setIsRegeneratingDirectory,
      setIsRegeneratingTags,
    } = useStore.getState();
    const activeConfig = modelConfigs.find((c) => c.id === activeConfigId);
    if (!activeConfig || !selectedModelId) {
      showNoModelSelectedToast();
      return null;
    }

    const fieldList = Array.isArray(fields) ? fields : [fields];

    regenerateAbortControllerRef.current?.abort();
    const internalAbortController = new AbortController();
    regenerateAbortControllerRef.current = internalAbortController;
    const abortSignal = options?.abortSignal
      ? AbortSignal.any([options.abortSignal, internalAbortController.signal])
      : internalAbortController.signal;

    if (fieldList.includes("title")) setIsRegeneratingTitle(true);
    if (fieldList.includes("summary")) setIsRegeneratingSummary(true);
    if (fieldList.includes("catalog")) setIsRegeneratingDirectory(true);
    if (fieldList.includes("tags")) setIsRegeneratingTags(true);

    try {
      const output = await streamRegenerateNoteFields({
        content,
        fields: fieldList,
        config: activeConfig,
        modelId: selectedModelId,
        includeExistingDirs,
        directories,
        abortSignal,
        onPartialResult: (result) => {
          options?.onPartialResult?.(result as Partial<NoteSchema>);
        },
      });

      if (!output) {
        return null;
      }

      if (!Array.isArray(fields)) {
        // Return the single field value as string or string[]
        const value = output[fields];
        if (fields === "catalog") {
          return value as string[] | undefined;
        }
        return value as string | undefined;
      }
      return output;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }

      console.error(`Failed to regenerate ${fields}:`, error);
      toast.error(t("ai.requestFailed"));
      return null;
    } finally {
      if (regenerateAbortControllerRef.current === internalAbortController) {
        regenerateAbortControllerRef.current = null;
      }
      if (fieldList.includes("title")) setIsRegeneratingTitle(false);
      if (fieldList.includes("summary")) setIsRegeneratingSummary(false);
      if (fieldList.includes("catalog")) setIsRegeneratingDirectory(false);
      if (fieldList.includes("tags")) setIsRegeneratingTags(false);
    }
  };

  return {
    isLoading,
    isRegeneratingTitle,
    isRegeneratingSummary,
    isRegeneratingDirectory,
    isRegeneratingTags,
    activeConfigId,
    selectedModelId,
    createEmptyNote,
    regenerate,
    cancelRegenerate: () => regenerateAbortControllerRef.current?.abort(),
  };
}
