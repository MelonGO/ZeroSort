import { BatchJob, RegenerateField, ZeroSortState } from "@/types";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

/**
 * Creates the batch job slice of the store.
 * Manages state for batch AI regeneration operations.
 */
export const createBatchJobSlice = (set: SetState, _get: GetState) => ({
  batchJob: null as BatchJob | null,

  startBatchJob: (noteIds: string[], fields: RegenerateField[]) => {
    set({
      batchJob: {
        id: crypto.randomUUID(),
        noteIds,
        fields,
        totalCount: noteIds.length,
        completedCount: 0,
        failedCount: 0,
        failedNoteIds: [],
        currentNoteIds: [],
        status: "running",
      },
    });
  },

  updateBatchProgress: (update: Partial<BatchJob>) => {
    set((state) => {
      if (!state.batchJob) return {};
      return { batchJob: { ...state.batchJob, ...update } };
    });
  },

  cancelBatchJob: () => {
    set((state) => {
      if (!state.batchJob) return {};
      return { batchJob: { ...state.batchJob, status: "cancelled" } };
    });
  },

  clearBatchJob: () => {
    set({ batchJob: null });
  },
});
