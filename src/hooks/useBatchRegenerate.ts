import { useNoModelSelectedToast } from "@/hooks/useNoModelSelectedToast";
import {
  getDirectoriesAction,
  getNotesAction,
  getTagsAction,
  saveNoteAction,
} from "@/lib/actions";
import { executeBatchRegeneration } from "@/lib/ai/batchRegenerate";
import type { RegenerateResult } from "@/lib/ai/regenerate";
import { resolveTagIdsFromNames } from "@/lib/tagNames";
import { getNoteContentFromStore } from "@/store/slices/notes";
import { useStore } from "@/store/useStore";
import type { Note, RegenerateField } from "@/types";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface PendingBatchProgress {
  completedCountDelta: number;
  failedCountDelta: number;
  failedNoteIds: string[];
  finishedNoteIds: string[];
  startedNoteIds: string[];
}

function createPendingBatchProgress(): PendingBatchProgress {
  return {
    completedCountDelta: 0,
    failedCountDelta: 0,
    failedNoteIds: [],
    finishedNoteIds: [],
    startedNoteIds: [],
  };
}

/**
 * Hook that orchestrates batch regeneration of note fields.
 * Manages the AbortController, wires execution callbacks to store updates,
 * and provides startBatch/cancelBatch to components.
 */
export function useBatchRegenerate() {
  const { t } = useTranslation();
  const showNoModelSelectedToast = useNoModelSelectedToast();
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingNoteUpdatesRef = useRef(new Map<string, Partial<Note>>());
  const pendingProgressRef = useRef(createPendingBatchProgress());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatchStoreUpdates = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const pendingNoteUpdates = pendingNoteUpdatesRef.current;
    const pendingProgress = pendingProgressRef.current;
    pendingNoteUpdatesRef.current = new Map();
    pendingProgressRef.current = createPendingBatchProgress();

    const state = useStore.getState();

    if (pendingNoteUpdates.size > 0) {
      state.updateNotes(pendingNoteUpdates);
    }

    const hasProgress =
      pendingProgress.startedNoteIds.length > 0 ||
      pendingProgress.finishedNoteIds.length > 0 ||
      pendingProgress.completedCountDelta > 0 ||
      pendingProgress.failedCountDelta > 0 ||
      pendingProgress.failedNoteIds.length > 0;

    if (!hasProgress || !state.batchJob) {
      return;
    }

    const currentNoteIds = new Set(state.batchJob.currentNoteIds);
    for (const noteId of pendingProgress.startedNoteIds) {
      currentNoteIds.add(noteId);
    }
    for (const noteId of pendingProgress.finishedNoteIds) {
      currentNoteIds.delete(noteId);
    }

    state.updateBatchProgress({
      completedCount:
        state.batchJob.completedCount + pendingProgress.completedCountDelta,
      failedCount:
        state.batchJob.failedCount + pendingProgress.failedCountDelta,
      failedNoteIds: [
        ...state.batchJob.failedNoteIds,
        ...pendingProgress.failedNoteIds,
      ],
      currentNoteIds: [...currentNoteIds],
    });
  }, []);

  const scheduleBatchStoreFlush = useCallback(() => {
    if (flushTimerRef.current) {
      return;
    }

    flushTimerRef.current = setTimeout(flushBatchStoreUpdates, 50);
  }, [flushBatchStoreUpdates]);

  const queueBatchStoreUpdate = useCallback(
    ({
      completedNoteId,
      failedNoteId,
      noteId,
      noteUpdates,
      startedNoteId,
    }: {
      completedNoteId?: string;
      failedNoteId?: string;
      noteId?: string;
      noteUpdates?: Partial<Note>;
      startedNoteId?: string;
    }) => {
      if (noteId && noteUpdates) {
        const pendingNoteUpdates = pendingNoteUpdatesRef.current;
        pendingNoteUpdates.set(noteId, {
          ...(pendingNoteUpdates.get(noteId) ?? {}),
          ...noteUpdates,
        });
      }

      const pendingProgress = pendingProgressRef.current;
      if (startedNoteId) {
        pendingProgress.startedNoteIds.push(startedNoteId);
      }
      if (completedNoteId) {
        pendingProgress.completedCountDelta += 1;
        pendingProgress.finishedNoteIds.push(completedNoteId);
      }
      if (failedNoteId) {
        pendingProgress.failedCountDelta += 1;
        pendingProgress.failedNoteIds.push(failedNoteId);
        pendingProgress.finishedNoteIds.push(failedNoteId);
      }

      scheduleBatchStoreFlush();
    },
    [scheduleBatchStoreFlush],
  );

  const startBatch = useCallback(
    async (noteIds: string[], fields: RegenerateField[]) => {
      const {
        notesById,
        directories,
        modelConfigs,
        activeConfigId,
        selectedModelId,
        includeExistingDirs,
        batchConcurrency,
        startBatchJob,
        updateBatchProgress,
        setDirectories,
        syncFromDb,
        sortBy,
        batchJob,
      } = useStore.getState();

      // Block if a batch is already running
      if (batchJob?.status === "running") {
        toast.error(t("batch.alreadyRunning"));
        return;
      }

      const activeConfig = modelConfigs.find((c) => c.id === activeConfigId);
      if (!activeConfig || !selectedModelId) {
        showNoModelSelectedToast();
        return;
      }

      const selectedNotes = noteIds
        .map((noteId) => notesById.get(noteId))
        .filter((note): note is Note => Boolean(note));
      if (selectedNotes.length === 0) return;

      pendingNoteUpdatesRef.current = new Map();
      pendingProgressRef.current = createPendingBatchProgress();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      // Abort any previous run
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      startBatchJob(noteIds, fields);

      await executeBatchRegeneration({
        notes: selectedNotes,
        fields,
        config: activeConfig,
        modelId: selectedModelId,
        includeExistingDirs,
        directories,
        concurrency: batchConcurrency,
        abortSignal: abortController.signal,
        getUpdatedDirectories: () => useStore.getState().directories,
        onNoteStart: (noteId: string) => {
          queueBatchStoreUpdate({ startedNoteId: noteId });
        },
        onProgress: async (
          noteId: string,
          result: RegenerateResult | null,
          loadedContent: string,
        ) => {
          if (!result) {
            // Null result treated as failure
            queueBatchStoreUpdate({ failedNoteId: noteId });
            return;
          }

          const currentNote = useStore.getState().notesById.get(noteId);
          if (!currentNote) {
            return;
          }

          const previousDirectoryId = currentNote.directoryId;

          // Apply updates to store
          const noteUpdates: Partial<Note> = {};
          if (result.title) noteUpdates.title = result.title;
          if (result.summary) noteUpdates.summary = result.summary;
          if (fields.includes("tags") && Array.isArray(result.tags)) {
            noteUpdates.tagIds = await resolveTagIdsFromNames({
              tagNames: result.tags,
              tags: useStore.getState().tags,
              addTag: useStore.getState().addTag,
            });
          }
          noteUpdates.updatedAt = new Date().toISOString();

          // Persist to DB — use loadedContent to avoid overwriting with empty stub
          const noteToSave = {
            ...currentNote,
            ...noteUpdates,
          };
          noteToSave.content = noteToSave.isContentLoaded
            ? getNoteContentFromStore(noteId) || loadedContent
            : loadedContent;
          const { directoryId } = await saveNoteAction(
            noteToSave,
            result.catalog,
          );

          // Reflect directory changes immediately so NoteCard updates without waiting for final sync.
          if (fields.includes("catalog")) {
            const normalizedDirectoryId = directoryId ?? null;
            if (previousDirectoryId !== normalizedDirectoryId) {
              noteUpdates.directoryId = normalizedDirectoryId;

              if (normalizedDirectoryId) {
                const hasDirectory = useStore
                  .getState()
                  .directories.some((dir) => dir.id === normalizedDirectoryId);
                if (!hasDirectory) {
                  const updatedDirs = await getDirectoriesAction();
                  setDirectories(updatedDirs as any);
                }
              }
            }
          }

          queueBatchStoreUpdate({
            noteId,
            noteUpdates,
            completedNoteId: noteId,
          });
        },
        onError: (noteId: string, error: unknown) => {
          console.error(`Batch regeneration failed for note ${noteId}:`, error);
          queueBatchStoreUpdate({ failedNoteId: noteId });
        },
        onComplete: async () => {
          flushBatchStoreUpdates();
          const state = useStore.getState();
          if (state.batchJob?.status === "running") {
            updateBatchProgress({ status: "completed", currentNoteIds: [] });
          }

          // Refresh from DB to ensure directory changes are reflected
          try {
            const [updatedNotes, updatedDirs, updatedTags] = await Promise.all([
              getNotesAction(sortBy),
              getDirectoriesAction(),
              getTagsAction(),
            ]);
            syncFromDb(updatedNotes as Note[], updatedDirs as any, updatedTags);
          } catch {
            // Non-critical — store already has inline updates
          }

          const finalState = useStore.getState();
          const completed = finalState.batchJob?.completedCount ?? 0;
          const failed = finalState.batchJob?.failedCount ?? 0;

          if (finalState.batchJob?.status === "cancelled") {
            toast.info(
              t("batch.cancelled", { completed, total: noteIds.length }),
            );
          } else if (failed > 0) {
            toast.warning(
              t("batch.completedWithErrors", { completed, failed }),
            );
          } else {
            toast.success(t("batch.completed", { count: completed }));
          }

          // Exit multi-select mode
          useStore.getState().toggleMultiSelectMode();
        },
      });
    },
    [
      flushBatchStoreUpdates,
      queueBatchStoreUpdate,
      showNoModelSelectedToast,
      t,
    ],
  );

  const cancelBatch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    flushBatchStoreUpdates();
    useStore.getState().cancelBatchJob();
  }, [flushBatchStoreUpdates]);

  return { startBatch, cancelBatch };
}
