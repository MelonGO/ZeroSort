import { ZeroSortState } from "@/types";
import { create } from "zustand";
import { createBatchJobSlice } from "./slices/batchJob";
import { createLicenseSlice } from "./slices/license";
import { createLinksSlice } from "./slices/links";
import { createNotesSlice } from "./slices/notes";
import { createSettingsSlice } from "./slices/settings";
import { createSyncSlice } from "./slices/sync";
import { createTagsSlice } from "./slices/tags";
import { createUiSlice } from "./slices/ui";

/**
 * Global state management store for the ZeroSort application.
 * Composed from domain-specific slices:
 * - settings: User preferences, AI model configs, persistence
 * - notes: Notes & directories CRUD, folder tree
 * - tags: Tag CRUD operations
 * - ui: Selection, sidebar, tabs, expansion states, transient flags
 * - sync: S3 sync connection and incremental sync operations
 * - license: Offline license key verification and status
 * - batchJob: Batch AI regeneration job tracking
 * - links: Bidirectional note links (backlinks and outgoing links)
 */
export const useStore = create<ZeroSortState>((set, get) => ({
  ...createSettingsSlice(set, get),
  ...createNotesSlice(set, get),
  ...createTagsSlice(set, get),
  ...createUiSlice(set, get),
  ...createSyncSlice(set, get),
  ...createLicenseSlice(set, get),
  ...createBatchJobSlice(set, get),
  ...createLinksSlice(set, get),
}));
