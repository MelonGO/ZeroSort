import { ProviderConfig } from "@/types/model";

// Export all sync-related types
export * from "./sync";

export interface S3Connection {
  id: string;
  bucket_name: string;
  region: string;
  endpoint_url: string;
}

export interface SyncStatus {
  isConnected: boolean;
  connection: S3Connection | null;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export type SyncRefreshTarget = "notes" | "directories" | "tags";

export interface SyncRefreshResult {
  ok: boolean;
  failed: SyncRefreshTarget[];
}

/**
 * Extended sync status for incremental sync with progress and preview support.
 */
export interface IncrementalSyncState {
  /** Whether an incremental sync is in progress */
  isSyncing: boolean;
  /** Current sync phase */
  phase: import("./sync").SyncPhase;
  /** Progress within the current phase */
  progress: import("./sync").SyncProgress | null;
  /** Last sync timestamp */
  lastSyncAt: string | null;
  /** Last error message */
  lastError: string | null;
  /** Active sync profile ID */
  activeProfileId: string | null;
  /** Current bucket being synced */
  activeBucket: string | null;
  /** Last sync preview result */
  lastPreview: import("./sync").SyncPlanSummary | null;
  /** Pending safety confirmation (set when sync is blocked by deletion threshold) */
  pendingSafetySync: {
    bucketName: string;
    safetyReport: import("@/lib/sync/guards").SafetyReport;
  } | null;
  /** Blocking safety issue that requires a recovery action instead of confirmation. */
  blockingSafetySync: {
    bucketName: string;
    safetyReport: import("@/lib/sync/guards").SafetyReport;
  } | null;
}

/**
 * Represents a single note in the application.
 */
export interface Note {
  /** Unique identifier for the note */
  id: string;
  /** Title of the note */
  title: string;
  /** AI-generated summary of the note content */
  summary: string;
  /** JSON string containing the Tiptap document content */
  content: string;
  /** ID of the directory where the note is stored */
  directoryId: string | null;
  /** IDs of tags assigned to this note */
  tagIds: string[];
  /** ISO timestamp of when the note was created */
  createdAt: string;
  /** ISO timestamp of the last update */
  updatedAt?: string;
  /** Flag to indicate if the full content has been loaded from the database */
  isContentLoaded?: boolean;
  /** Monotonically increasing counter bumped on content load/save to signal re-renders */
  contentVersion?: number;
}

/**
 * Result returned by note save actions.
 */
export interface SaveNoteActionResult {
  /** Whether the save completed successfully. */
  success: boolean;
  /** Resolved directory ID when catalog persistence creates or resolves directories. */
  directoryId: string | null;
  /** Non-fatal warnings emitted after the note itself was persisted. */
  warnings: string[];
}

/**
 * Represents a tag that can be assigned to notes.
 */
export interface Tag {
  /** Unique identifier for the tag */
  id: string;
  /** Display name of the tag */
  name: string;
  /** Optional color for the tag (hex or OKLCH string) */
  color: string | null;
  /** ISO timestamp of when the tag was created */
  createdAt: string;
  /** ISO timestamp of the last update */
  updatedAt?: string;
}

/**
 * Result returned by tag save actions.
 */
export interface SaveTagActionResult {
  /** Whether the save completed successfully. */
  success: boolean;
  /** The persisted tag payload. */
  tag: Tag;
}

/**
 * Describes the outcome of a tag rename operation.
 */
export interface TagRenameResult {
  /** Whether the rename merged into an existing tag. */
  merged: boolean;
  /** Original tag ID that was renamed. */
  sourceTagId: string;
  /** Surviving tag ID after the rename or merge. */
  targetTagId: string;
  /** Note IDs whose tag relationships changed during a merge. */
  affectedNoteIds: string[];
  /** Timestamp applied to affected notes when a merge changes note-tag relationships. */
  noteUpdatedAt?: string;
}

/**
 * Result returned by tag update actions.
 */
export interface UpdateTagResult {
  /** Whether the update completed successfully. */
  success: boolean;
  /** The surviving tag after the update finishes. */
  tag: Tag | null;
  /** Merge metadata when the rename merged into an existing tag. */
  merge: TagRenameResult | null;
}

/**
 * Result returned by tag delete actions.
 */
export interface DeleteTagsResult {
  /** Whether the delete completed successfully. */
  success: boolean;
  /** Tag IDs deleted by the mutation. */
  deletedTagIds: string[];
  /** Notes whose tag relationships changed during the delete. */
  affectedNoteIds: string[];
  /** Timestamp applied to affected notes when note-tag relationships changed. */
  noteUpdatedAt?: string;
}

/**
 * Result returned by cleanup actions for unused tags or empty directories.
 */
export interface CleanupResult {
  /** Whether the cleanup completed successfully. */
  success: boolean;
  /** Entity IDs removed by the cleanup. */
  deletedIds: string[];
}

/**
 * Preview item shown before a cleanup action is confirmed.
 */
export interface CleanupPreviewItem {
  /** Entity ID that would be deleted. */
  id: string;
  /** Human-readable label shown in the confirmation dialog. */
  label: string;
}

/**
 * Result returned by cleanup preview actions.
 */
export interface CleanupPreviewResult {
  /** Entities that would be removed by the cleanup. */
  items: CleanupPreviewItem[];
}

/**
 * Represents a node in the virtual hierarchical folder tree.
 * Computed from notes and directories.
 */
export interface FolderNode {
  /** Name of the folder */
  name: string;
  /** Optional identifier for manually managed directories */
  id?: string;
  /** Map of subfolders keyed by their names */
  children: { [key: string]: FolderNode };
  /** List of note IDs contained directly in this folder */
  noteIds: string[];
}

/**
 * Represents a persistent directory entry in the database.
 */
export interface Directory {
  /** Unique identifier for the directory */
  id: string;
  /** Display name of the directory */
  name: string;
  /** ID of the parent directory, or null if it's at the root */
  parentId: string | null;
  /** Full path representation for utility purposes */
  path?: string;
  /** ISO timestamp of the last update */
  updatedAt?: string;
}

/**
 * Supported UI themes.
 */
export type Theme = "light" | "dark" | "system";

/**
 * Supported application languages.
 */
export type Language =
  | "en"
  | "zh"
  | "ar"
  | "de"
  | "es"
  | "fr"
  | "it"
  | "ja"
  | "ko"
  | "pt"
  | "ru";

/**
 * Available content scale options
 */
export type ContentScale = "sm" | "base" | "lg" | "xl" | "2xl";

/**
 * AI assist mode for the editor.
 */
export type AiMenuMode = "off" | "selection" | "askAi";

/**
 * Available sorting fields for notes.
 */
export type SortBy = "createdAt" | "updatedAt";

/**
 * Represents a wiki-style link extracted from note content.
 */
export interface WikiLink {
  /** Raw text inside [[ ]], e.g., "Note Title" or "Note Title|Display" */
  linkText: string;
  /** Display text if using [[Title|Display]] syntax */
  displayText?: string;
  /** Resolved target note ID (null if note doesn't exist) */
  targetNoteId: string | null;
  /** Position in the document (character offset) */
  position: number;
}

/**
 * Represents a persisted link relationship between two notes.
 */
export interface NoteLink {
  /** Source note ID */
  sourceNoteId: string;
  /** Target note ID */
  targetNoteId: string | null;
  /** Link display text */
  linkText: string;
  /** Snapshot of target note title */
  targetTitle: string;
  /** Target note summary for preview */
  targetSummary?: string;
  /** Position in source document */
  position: number;
  /** Is this link broken (target doesn't exist)? */
  isBroken: boolean;
  /** ISO timestamp of when the link was created */
  createdAt: string;
  /** ISO timestamp of the last update */
  updatedAt?: string;
}

/**
 * Groups backlinks from a single source note.
 */
export interface BacklinkGroup {
  /** Note that links to current note */
  sourceNote: Note;
  /** All links from that note to current note */
  links: NoteLink[];
  /** Content excerpt showing the link context */
  context?: string;
}

/**
 * Fields that can be regenerated by AI for a note.
 */
export type RegenerateField = "title" | "summary" | "catalog" | "tags";

/**
 * Status of a batch regeneration job.
 */
export type BatchJobStatus = "running" | "cancelled" | "completed";

/**
 * Tracks the state of a batch AI regeneration job.
 */
export interface BatchJob {
  /** Unique identifier for the job */
  id: string;
  /** IDs of notes to regenerate */
  noteIds: string[];
  /** Fields to regenerate for each note */
  fields: RegenerateField[];
  /** Total number of notes in the batch */
  totalCount: number;
  /** Number of notes successfully regenerated */
  completedCount: number;
  /** Number of notes that failed */
  failedCount: number;
  /** IDs of notes that failed regeneration */
  failedNoteIds: string[];
  /** IDs of notes currently being processed (supports concurrent execution) */
  currentNoteIds: string[];
  /** Current status of the batch job */
  status: BatchJobStatus;
}

/**
 * Visibility settings for editor toolbar button groups.
 * Each key controls the visibility of a group of related toolbar buttons.
 */
export interface ToolbarGroupVisibility {
  /** Undo and Redo buttons */
  history: boolean;
  /** Heading 1, 2, and 3 buttons */
  headings: boolean;
  /** Bold, Italic, Underline, Strikethrough, Highlight, and Text Color buttons */
  formatting: boolean;
  /** Bullet List, Ordered List, and Task List buttons */
  lists: boolean;
  /** Quote, Inline Code, Code Block, and Horizontal Rule buttons */
  block: boolean;
  /** Link, Table, Inline Math, and Block Math buttons */
  insert: boolean;
  /** Copy Markdown, AI Assistant, Excalidraw, and Mermaid buttons */
  tools: boolean;
}

/**
 * The global state interface for ZeroSort, managed via Zustand.
 */
export interface ZeroSortState {
  // --- Data State ---
  /** All notes currently loaded in memory */
  notes: Note[];
  /** Notes indexed by ID for O(1) lookups across the app */
  notesById: Map<string, Note>;
  /** All directories currently loaded in memory */
  directories: Directory[];
  /** All tags currently loaded in memory */
  tags: Tag[];
  /** Computed hierarchical tree structure for the sidebar */
  folderTree: FolderNode;

  // --- UI State ---
  /** Whether multi-select mode is active */
  isMultiSelectMode: boolean;
  /** Set of note IDs currently selected in multi-select mode */
  selectedNoteIds: Set<string>;
  /** ID of the currently active/selected note */
  selectedNoteId: string | null;
  /** ID of the note that was last closed or selected */
  lastSelectedNoteId: string | null;
  /** Whether the sidebar is currently visible */
  isSidebarOpen: boolean;
  /** Set of paths that are currently expanded in the folder tree */
  expandedPaths: Set<string>;
  /** Set of note IDs that are currently expanded in the list view */
  expandedNoteIds: Set<string>;
  /** Flag to track if the current note has unsaved edits */
  hasUnsavedChanges: boolean;
  /** Callback registered by NoteViewer to save the current note from outside the component */
  saveCurrentNote: (() => Promise<boolean>) | null;
  /** Temporary storage for a note ID when navigation is pending confirmation */
  pendingNoteId: string | null | undefined;
  /** Temporary storage for a note ID when a tab close is pending confirmation */
  pendingCloseNoteId: string | undefined;
  /** Whether the application has finished its initial data fetch */
  isInitialized: boolean;
  /** Whether to show the AI-generated summary in the UI */
  showSummary: boolean;
  /** Whether to include existing directory hierarchy as context when AI generates directories */
  includeExistingDirs: boolean;
  /** Whether the AI is currently regenerating the title */
  isRegeneratingTitle: boolean;
  /** Whether the AI is currently regenerating the summary */
  isRegeneratingSummary: boolean;
  /** Whether the AI is currently regenerating the directory */
  isRegeneratingDirectory: boolean;
  /** Whether the AI is currently regenerating tags */
  isRegeneratingTags: boolean;
  /** Set of tag IDs currently selected for filtering */
  selectedTagIds: Set<string>;
  /** Tag filter mode: 'and' requires all tags, 'or' requires any tag */
  tagFilterMode: "and" | "or";
  /** Persisted scroll position for the home page */
  homeScrollPosition: number;
  /** Current sorting field for notes */
  sortBy: SortBy;
  /** Current search query for notes and directories */
  searchQuery: string;
  /** Selected date for filtering notes */
  selectedDate: Date | null;
  /** IDs of notes currently open in tabs */
  openNoteIds: string[];
  /** Recently loaded note IDs ordered from least to most recent */
  loadedNoteRecency: string[];
  /** Scroll position per note ID */
  noteScrollPositions: Record<string, number>;
  /** Whether the settings have been loaded from store */
  isSettingsLoaded: boolean;
  // --- Configuration & Settings ---
  /** Current UI theme preference */
  theme: Theme;
  /** Name of the currently selected theme preset */
  themePreset: string;
  /** Current application language */
  language: Language;
  /** Scaling factor for the entire UI */
  interfaceScale: number;
  /** Text size for the note content editor */
  contentScale: ContentScale;
  /** Whether code blocks should wrap text instead of horizontal scroll */
  codeWrapEnabled: boolean;
  /** Active AI assist mode: off, selection-based floating menu, or Ask AI panel */
  aiMenuMode: AiMenuMode;
  /** Whether to show note counts next to folder names in the sidebar */
  showFolderNoteCount: boolean;
  /** Whether to show the character count in the editor */
  showCharacterCount: boolean;
  /** Visibility settings for editor toolbar button groups */
  toolbarGroups: ToolbarGroupVisibility;

  // --- Model Management ---
  /** List of AI provider configurations */
  modelConfigs: ProviderConfig[];
  /** ID of the currently active AI provider configuration */
  activeConfigId: string | null;
  /** ID of the currently selected model within the active provider */
  selectedModelId: string | null;

  // --- S3 Sync ---
  /** Current S3 sync connection status */
  syncStatus: SyncStatus;
  /** Incremental sync state for three-way comparison sync */
  incrementalSync: IncrementalSyncState;
  /** Number of concurrent operations during sync (1-50) */
  syncConcurrency: number;
  /** Number of concurrent AI operations during batch regeneration (1-10) */
  batchConcurrency: number;

  // --- Batch Job ---
  /** Active batch regeneration job, or null if none is running */
  batchJob: BatchJob | null;

  // --- Actions ---
  setModelConfigs: (configs: ProviderConfig[]) => void;
  setActiveConfigId: (id: string | null) => void;
  setSelectedModelId: (id: string | null) => void;
  addProviderConfig: (config: ProviderConfig) => void;
  updateProviderConfig: (id: string, updates: Partial<ProviderConfig>) => void;
  deleteProviderConfig: (id: string) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  updateNotes: (updatesById: Map<string, Partial<Note>>) => void;
  deleteNote: (id: string) => void;
  setNotes: (notes: Note[]) => void;
  /** Adds a tag to a specific note */
  addTagToNote: (noteId: string, tagId: string) => void;
  /** Removes a tag from a specific note */
  removeTagFromNote: (noteId: string, tagId: string) => void;
  /** Replaces all tags on a specific note */
  setNoteTagIds: (noteId: string, tagIds: string[]) => void;
  /** Fetches and updates the content of a specific note in the store */
  loadNoteContent: (id: string) => Promise<void>;
  /** Marks a loaded note as recently accessed for bounded caching */
  markNoteContentAccessed: (id: string) => void;
  /** Releases a note's loaded content and related cache state */
  unloadNoteContent: (id: string) => void;
  /** Evicts least-recently-used note content when the cache grows too large */
  pruneLoadedNoteContent: () => void;
  /** Releases all cached note content (raw + parsed) when no notes are open. */
  releaseAllNoteContent: () => void;
  setDirectories: (directories: Directory[]) => void;
  addDirectory: (name: string, parentId: string | null) => void;
  updateDirectory: (id: string, updates: Partial<Directory>) => void;
  moveDirectory: (id: string, newParentId: string | null) => Promise<void>;
  deleteDirectory: (id: string, deleteNotes?: boolean) => void;
  cleanupEmptyDirectories: () => Promise<number>;
  moveNote: (noteId: string, target: string | string[] | null) => Promise<void>;
  setSelectedNoteId: (id: string | null) => void;
  closeNote: (id: string) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  /** Registers or clears the save callback for the currently open note */
  setSaveCurrentNote: (fn: (() => Promise<boolean>) | null) => void;
  confirmNoteSelection: (id: string | null) => void;
  cancelNoteSelection: () => void;
  /** Enters or exits multi-select mode */
  toggleMultiSelectMode: () => void;
  /** Toggles a note's selection state in multi-select mode */
  toggleNoteSelection: (id: string) => void;
  /** Adds the provided note IDs to the current selection */
  addToNoteSelection: (noteIds: string[]) => void;
  /** Removes the provided note IDs from the current selection */
  removeFromNoteSelection: (noteIds: string[]) => void;
  /** Attempts to close a note tab, checking for unsaved changes first */
  confirmCloseNote: (id: string) => void;
  /** Cancels a pending note tab close */
  cancelCloseNote: () => void;
  /** Reorders currently open note tabs by insertion index */
  reorderOpenNotes: (fromIndex: number, toIndex: number) => void;
  toggleSidebar: () => void;
  togglePath: (path: string) => void;
  /** Toggles the expansion state of a specific note in the list. */
  toggleNoteExpansion: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  syncFromDb: (notes: Note[], directories: Directory[], tags?: Tag[]) => void;
  // --- Tag Actions ---
  /** Adds a new tag or returns an existing one with the same normalized name. */
  addTag: (name: string, color?: string | null) => Promise<Tag | null>;
  /** Updates an existing tag */
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>;
  /** Deletes a tag */
  deleteTag: (id: string) => Promise<void>;
  /** Deletes multiple tags */
  deleteTags: (ids: string[]) => Promise<void>;
  /** Deletes tags that are not assigned to any note */
  cleanupUnusedTags: () => Promise<number>;
  /** Overwrites the current tags list */
  setTags: (tags: Tag[]) => void;
  setInitialized: (initialized: boolean) => void;
  toggleSummary: () => void;
  /** Updates and persists the preference for including existing directories in AI prompts */
  setIncludeExistingDirs: (include: boolean) => void;
  setTheme: (theme: Theme) => void;
  setThemePreset: (themePreset: string) => void;
  setLanguage: (lang: Language) => void;
  setInterfaceScale: (scale: number) => void;
  setContentScale: (scale: ContentScale) => void;
  setCodeWrapEnabled: (enabled: boolean) => void;
  setAiMenuMode: (mode: AiMenuMode) => void;
  /** Updates and persists the preference for showing folder note counts */
  setShowFolderNoteCount: (show: boolean) => void;
  /** Updates and persists the preference for showing character counts */
  setShowCharacterCount: (show: boolean) => void;
  /** Updates and persists the visibility of editor toolbar button groups */
  setToolbarGroups: (groups: Partial<ToolbarGroupVisibility>) => void;
  setIsRegeneratingTitle: (isRegenerating: boolean) => void;
  setIsRegeneratingSummary: (isRegenerating: boolean) => void;
  setIsRegeneratingDirectory: (isRegenerating: boolean) => void;
  setIsRegeneratingTags: (isRegenerating: boolean) => void;
  /** Toggles a tag's selection state for filtering */
  toggleTagFilter: (tagId: string) => void;
  /** Clears all tag filter selections */
  clearTagFilters: () => void;
  /** Sets the tag filter mode */
  setTagFilterMode: (mode: "and" | "or") => void;
  /** Sets the scroll position for the home page */
  setHomeScrollPosition: (pos: number) => void;
  /** Sets the scroll position for a specific note */
  setNoteScrollPosition: (id: string, pos: number) => void;
  /** Sets the sorting field for notes */
  setSortBy: (sortBy: SortBy) => void;
  /** Sets the search query for notes and directories */
  setSearchQuery: (query: string) => void;
  /** Sets the selected date for filtering notes */
  setSelectedDate: (date: Date | null) => void;
  /** Initializes settings from the host store */
  initSettings: () => Promise<void>;

  // --- S3 Sync Actions ---
  setSyncStatus: (status: Partial<SyncStatus>) => void;
  connectS3Sync: (config: {
    bucket_name: string;
    access_key_id: string;
    secret_access_key: string;
    region: string;
    endpoint_url: string;
  }) => Promise<boolean>;
  loadSavedConnection: () => Promise<void>;
  disconnectS3Sync: () => Promise<void>;

  // --- Incremental Sync Actions ---
  /** Updates the incremental sync state */
  setIncrementalSync: (state: Partial<IncrementalSyncState>) => void;
  /** Preview what changes would occur during sync */
  previewSync: (
    bucketName: string,
  ) => Promise<import("./sync").SyncPlanSummary | null>;
  /** Perform incremental sync with three-way comparison */
  performSync: (bucketName: string) => Promise<boolean>;
  /** Confirm and proceed with sync despite safety warnings */
  confirmSyncDespiteSafety: () => Promise<boolean>;
  /** Recover local state from remote data after an unexpected empty-local block. */
  recoverFromRemote: (bucketName: string) => Promise<boolean>;
  /** Dismiss the safety confirmation dialog */
  dismissSafetyDialog: () => void;
  /** Refresh local state after sync completes */
  refreshAfterSync: () => Promise<SyncRefreshResult>;
  /** Sets the sync concurrency level (1-50) and persists it */
  setSyncConcurrency: (concurrency: number) => Promise<void>;
  /** Sets the batch regeneration concurrency level (1-10) and persists it */
  setBatchConcurrency: (concurrency: number) => Promise<void>;

  // --- Batch Job Actions ---
  /** Starts a new batch regeneration job */
  startBatchJob: (noteIds: string[], fields: RegenerateField[]) => void;
  /** Updates the batch job progress */
  updateBatchProgress: (update: Partial<BatchJob>) => void;
  /** Cancels the active batch job */
  cancelBatchJob: () => void;
  /** Clears the completed/cancelled batch job */
  clearBatchJob: () => void;

  // --- Bidirectional Linking Actions ---
  /** Backlinks to the currently selected note */
  currentNoteBacklinks: BacklinkGroup[];
  /** Outgoing links from currently selected note */
  currentNoteOutgoingLinks: NoteLink[];
  /** Loads backlinks and outgoing links for a note */
  loadNoteLinks: (noteId: string) => Promise<void>;
  /** Updates note links after content changes */
  updateNoteLinks: (noteId: string, content: string) => Promise<void>;
  /** Refreshes backlinks for a specific note */
  refreshBacklinks: (noteId: string) => Promise<void>;
}
