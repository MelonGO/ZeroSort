import i18n from "@/i18n";
import {
  getDirectoriesAction,
  getNotesAction,
  getTagsAction,
} from "@/lib/actions";
import { getOrCreateActiveSyncProfile } from "@/lib/db/syncProfiles";
import { clearSyncRecordsByProfile } from "@/lib/db/syncRecords";
import {
  connectS3Sync,
  disconnectS3Sync,
  performIncrementalSync,
  previewIncrementalSync,
} from "@/lib/sync";
import { DEFAULT_SYNC_PREFIX } from "@/lib/sync/prefix";
import {
  deleteS3Config,
  getS3Config,
  saveS3Config,
} from "@/lib/sync/s3-config";
import {
  IncrementalSyncState,
  SyncRefreshResult,
  SyncRefreshTarget,
  SyncStatus,
  ZeroSortState,
} from "@/types";
import type { IncrementalSyncStatus, SyncProgress } from "@/types/sync";
import { toast } from "sonner";

type SetState = (
  partial:
    | Partial<ZeroSortState>
    | ((state: ZeroSortState) => Partial<ZeroSortState>),
) => void;
type GetState = () => ZeroSortState;

function buildActiveProfileConfig(
  bucketName: string,
  connection: NonNullable<SyncStatus["connection"]>,
) {
  return {
    label: connection.bucket_name,
    serviceType: "s3" as const,
    region: connection.region,
    endpointUrl: connection.endpoint_url,
    bucketName,
    prefix: DEFAULT_SYNC_PREFIX,
    isActive: true,
  };
}

function getRefreshFailureMessage(result: SyncRefreshResult) {
  if (result.failed.length === 1 && result.failed[0] === "tags") {
    return i18n.t("sync.refreshPartialTags");
  }

  return i18n.t("sync.refreshFailed");
}

function notifyRefreshOutcome(result: SyncRefreshResult) {
  if (result.failed.length === 0) {
    return;
  }

  const message = getRefreshFailureMessage(result);

  if (result.ok) {
    toast.warning(message, { position: "bottom-left" });
    return;
  }

  toast.error(message, { position: "bottom-left" });
}

function isUnexpectedEmptyLocalBlock(
  safetyReport: NonNullable<
    IncrementalSyncState["pendingSafetySync"]
  >["safetyReport"],
) {
  return safetyReport.checks.some(
    (check) => check.code === "unexpected_empty_local" && !check.passed,
  );
}

/**
 * Creates the sync slice of the store.
 * Manages S3 sync connection, incremental sync operations, and sync state.
 */
export const createSyncSlice = (set: SetState, get: GetState) => ({
  // --- Initial State ---
  syncStatus: {
    isConnected: false,
    connection: null,
    isSyncing: false,
    lastSyncAt: null,
    lastError: null,
  } as SyncStatus,
  incrementalSync: {
    isSyncing: false,
    phase: "idle",
    progress: null,
    lastSyncAt: null,
    lastError: null,
    activeProfileId: null,
    activeBucket: null,
    lastPreview: null,
    pendingSafetySync: null,
    blockingSafetySync: null,
  } as IncrementalSyncState,

  setSyncStatus: (status: Partial<SyncStatus>) => {
    const current = get().syncStatus;
    set({ syncStatus: { ...current, ...status } });
  },

  connectS3Sync: async (config: {
    bucket_name: string;
    access_key_id: string;
    secret_access_key: string;
    region: string;
    endpoint_url: string;
  }) => {
    try {
      get().setSyncStatus({ isSyncing: true, lastError: null });
      const connection = await connectS3Sync(config);

      // Save configuration securely
      await saveS3Config({
        bucket_name: config.bucket_name,
        access_key_id: config.access_key_id,
        secret_access_key: config.secret_access_key,
        region: config.region,
        endpoint_url: config.endpoint_url,
      });

      get().setSyncStatus({
        isConnected: true,
        connection,
        isSyncing: false,
        lastError: null,
      });
      toast.success(i18n.t("sync.connected"));
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Connection failed";
      get().setSyncStatus({
        isConnected: false,
        isSyncing: false,
        lastError: message,
      });
      toast.error(message, { position: "bottom-left" });
      return false;
    }
  },

  loadSavedConnection: async () => {
    try {
      const config = await getS3Config();
      if (config) {
        await get().connectS3Sync(config);
      }
    } catch (error) {
      console.error("Failed to load saved S3 config:", error);
    }
  },

  disconnectS3Sync: async () => {
    const { syncStatus } = get();
    if (syncStatus.connection) {
      try {
        await disconnectS3Sync(syncStatus.connection.id);
        await deleteS3Config();
      } catch {
        // Ignore errors on disconnect
      }
    }
    get().setSyncStatus({
      isConnected: false,
      connection: null,
      lastError: null,
    });
  },

  // --- Incremental Sync Actions ---

  setIncrementalSync: (state: Partial<IncrementalSyncState>) => {
    const current = get().incrementalSync;
    set({ incrementalSync: { ...current, ...state } });
  },

  previewSync: async (bucketName: string) => {
    const { syncStatus } = get();
    if (!syncStatus.isConnected || !syncStatus.connection) {
      toast.error(i18n.t("sync.notConnected"), { position: "bottom-left" });
      return null;
    }

    try {
      const profile = await getOrCreateActiveSyncProfile(
        buildActiveProfileConfig(bucketName, syncStatus.connection),
      );

      get().setIncrementalSync({
        isSyncing: true,
        phase: "collecting",
        progress: null,
        activeBucket: bucketName,
        activeProfileId: profile.id,
        lastError: null,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });

      const preview = await previewIncrementalSync({
        profileId: profile.id,
        connectionId: syncStatus.connection.id,
        bucketName,
        endpointUrl: syncStatus.connection.endpoint_url,
        prefix: profile.prefix,
      });

      const blockingSafetySync = isUnexpectedEmptyLocalBlock(
        preview.safetyReport,
      )
        ? {
            bucketName,
            safetyReport: preview.safetyReport,
          }
        : null;

      get().setIncrementalSync({
        isSyncing: false,
        phase: "idle",
        progress: null,
        lastPreview: preview.safetyReport.summary,
        lastError: preview.wouldBeBlocked
          ? preview.safetyReport.checks.find((check) => !check.passed)
              ?.warning || i18n.t("sync.blockedBySafety")
          : null,
        pendingSafetySync: null,
        blockingSafetySync,
      });

      return preview.safetyReport.summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed";
      get().setIncrementalSync({
        isSyncing: false,
        phase: "idle",
        progress: null,
        lastPreview: null,
        lastError: message,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });
      toast.error(message, { position: "bottom-left" });
      return null;
    }
  },

  performSync: async (bucketName: string) => {
    const { syncStatus } = get();
    if (!syncStatus.isConnected || !syncStatus.connection) {
      toast.error(i18n.t("sync.notConnected"), { position: "bottom-left" });
      return false;
    }

    try {
      const profile = await getOrCreateActiveSyncProfile(
        buildActiveProfileConfig(bucketName, syncStatus.connection),
      );

      get().setIncrementalSync({
        isSyncing: true,
        phase: "connecting",
        progress: null,
        activeBucket: bucketName,
        activeProfileId: profile.id,
        lastError: null,
        lastPreview: null,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });

      const result = await performIncrementalSync({
        profileId: profile.id,
        connectionId: syncStatus.connection.id,
        bucketName,
        endpointUrl: syncStatus.connection.endpoint_url,
        prefix: profile.prefix,
        concurrency: get().syncConcurrency,
        onProgress: (progress: SyncProgress) => {
          get().setIncrementalSync({
            phase: progress.phase,
            progress,
          });
        },
        onStatusChange: (status: Partial<IncrementalSyncStatus>) => {
          if (status.phase) {
            get().setIncrementalSync({ phase: status.phase });
          }
        },
      });

      if (result.success) {
        const syncTimestamp = new Date().toISOString();

        get().setIncrementalSync({
          isSyncing: false,
          phase: "idle",
          progress: null,
          lastSyncAt: syncTimestamp,
          lastError: null,
          lastPreview: null,
          blockingSafetySync: null,
        });

        // Also update legacy sync status for UI consistency
        get().setSyncStatus({
          lastSyncAt: syncTimestamp,
          lastError: null,
        });

        const refreshResult = await get().refreshAfterSync();

        toast.success(
          i18n.t("sync.syncComplete", {
            uploaded: result.uploaded,
            downloaded: result.downloaded,
          }),
        );

        notifyRefreshOutcome(refreshResult);

        return true;
      } else {
        if (result.blockedBySafety && result.safetyReport) {
          const blockingSafetySync = isUnexpectedEmptyLocalBlock(
            result.safetyReport,
          )
            ? {
                bucketName,
                safetyReport: result.safetyReport,
              }
            : null;

          // Store safety report so the UI can show a confirmation dialog
          get().setIncrementalSync({
            isSyncing: false,
            phase: "idle",
            progress: null,
            lastError:
              result.safetyReport.checks.find((check) => !check.passed)
                ?.warning || i18n.t("sync.blockedBySafety"),
            lastPreview: result.safetyReport.summary,
            pendingSafetySync: blockingSafetySync
              ? null
              : {
                  bucketName,
                  safetyReport: result.safetyReport,
                },
            blockingSafetySync,
          });
          return false;
        }

        const errorMsg = result.errors[0] || "Sync failed";

        get().setIncrementalSync({
          isSyncing: false,
          phase: "idle",
          progress: null,
          lastPreview: null,
          lastError: errorMsg,
          pendingSafetySync: null,
          blockingSafetySync: null,
        });

        toast.error(errorMsg, { position: "bottom-left" });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      get().setIncrementalSync({
        isSyncing: false,
        phase: "idle",
        progress: null,
        lastPreview: null,
        lastError: message,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });
      toast.error(message, { position: "bottom-left" });
      return false;
    }
  },

  confirmSyncDespiteSafety: async () => {
    const { incrementalSync, syncStatus } = get();
    const pending = incrementalSync.pendingSafetySync;

    if (!pending || !syncStatus.isConnected || !syncStatus.connection) {
      return false;
    }

    try {
      const profile = await getOrCreateActiveSyncProfile(
        buildActiveProfileConfig(pending.bucketName, syncStatus.connection),
      );

      get().setIncrementalSync({
        isSyncing: true,
        phase: "connecting",
        progress: null,
        activeBucket: pending.bucketName,
        activeProfileId: profile.id,
        lastError: null,
        lastPreview: pending.safetyReport.summary,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });

      const result = await performIncrementalSync({
        profileId: profile.id,
        connectionId: syncStatus.connection.id,
        bucketName: pending.bucketName,
        endpointUrl: syncStatus.connection.endpoint_url,
        prefix: profile.prefix,
        concurrency: get().syncConcurrency,
        skipSafetyChecks: true,
        onProgress: (progress: SyncProgress) => {
          get().setIncrementalSync({
            phase: progress.phase,
            progress,
          });
        },
        onStatusChange: (status: Partial<IncrementalSyncStatus>) => {
          if (status.phase) {
            get().setIncrementalSync({ phase: status.phase });
          }
        },
      });

      if (result.success) {
        const syncTimestamp = new Date().toISOString();

        get().setIncrementalSync({
          isSyncing: false,
          phase: "idle",
          progress: null,
          lastSyncAt: syncTimestamp,
          lastError: null,
          lastPreview: null,
          blockingSafetySync: null,
        });

        get().setSyncStatus({
          lastSyncAt: syncTimestamp,
          lastError: null,
        });

        const refreshResult = await get().refreshAfterSync();

        toast.success(
          i18n.t("sync.syncComplete", {
            uploaded: result.uploaded,
            downloaded: result.downloaded,
          }),
        );

        notifyRefreshOutcome(refreshResult);
        return true;
      } else {
        const errorMsg = result.errors[0] || "Sync failed";
        get().setIncrementalSync({
          isSyncing: false,
          phase: "idle",
          progress: null,
          lastPreview: null,
          lastError: errorMsg,
          pendingSafetySync: null,
          blockingSafetySync: null,
        });
        toast.error(errorMsg, { position: "bottom-left" });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      get().setIncrementalSync({
        isSyncing: false,
        phase: "idle",
        progress: null,
        lastPreview: null,
        lastError: message,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });
      toast.error(message, { position: "bottom-left" });
      return false;
    }
  },

  recoverFromRemote: async (bucketName: string) => {
    const { syncStatus } = get();
    if (!syncStatus.isConnected || !syncStatus.connection) {
      toast.error(i18n.t("sync.notConnected"), { position: "bottom-left" });
      return false;
    }

    try {
      const profile = await getOrCreateActiveSyncProfile(
        buildActiveProfileConfig(bucketName, syncStatus.connection),
      );

      get().setIncrementalSync({
        isSyncing: true,
        phase: "connecting",
        progress: null,
        activeBucket: bucketName,
        activeProfileId: profile.id,
        lastError: null,
        lastPreview: null,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });

      await clearSyncRecordsByProfile(profile.id);

      const result = await performIncrementalSync({
        profileId: profile.id,
        connectionId: syncStatus.connection.id,
        bucketName,
        endpointUrl: syncStatus.connection.endpoint_url,
        prefix: profile.prefix,
        syncDirection: "pull_only",
        concurrency: get().syncConcurrency,
        onProgress: (progress: SyncProgress) => {
          get().setIncrementalSync({
            phase: progress.phase,
            progress,
          });
        },
        onStatusChange: (status: Partial<IncrementalSyncStatus>) => {
          if (status.phase) {
            get().setIncrementalSync({ phase: status.phase });
          }
        },
      });

      if (!result.success) {
        const errorMsg = result.errors[0] || "Sync failed";
        get().setIncrementalSync({
          isSyncing: false,
          phase: "idle",
          progress: null,
          lastPreview: null,
          lastError: errorMsg,
          pendingSafetySync: null,
          blockingSafetySync: null,
        });
        toast.error(errorMsg, { position: "bottom-left" });
        return false;
      }

      const syncTimestamp = new Date().toISOString();

      get().setIncrementalSync({
        isSyncing: false,
        phase: "idle",
        progress: null,
        lastSyncAt: syncTimestamp,
        lastError: null,
        lastPreview: null,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });

      get().setSyncStatus({
        lastSyncAt: syncTimestamp,
        lastError: null,
      });

      const refreshResult = await get().refreshAfterSync();

      toast.success(i18n.t("sync.recoveryComplete"));
      notifyRefreshOutcome(refreshResult);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      get().setIncrementalSync({
        isSyncing: false,
        phase: "idle",
        progress: null,
        lastPreview: null,
        lastError: message,
        pendingSafetySync: null,
        blockingSafetySync: null,
      });
      toast.error(message, { position: "bottom-left" });
      return false;
    }
  },

  dismissSafetyDialog: () => {
    get().setIncrementalSync({ pendingSafetySync: null });
  },

  refreshAfterSync: async () => {
    const results = await Promise.allSettled([
      getNotesAction(get().sortBy),
      getDirectoriesAction(),
      getTagsAction(),
    ]);

    const [notesResult, directoriesResult, tagsResult] = results;
    const failed: SyncRefreshTarget[] = [];

    if (notesResult.status === "rejected") {
      failed.push("notes");
      console.error("Failed to refresh notes after sync:", notesResult.reason);
    }

    if (directoriesResult.status === "rejected") {
      failed.push("directories");
      console.error(
        "Failed to refresh directories after sync:",
        directoriesResult.reason,
      );
    }

    if (tagsResult.status === "rejected") {
      failed.push("tags");
      console.error("Failed to refresh tags after sync:", tagsResult.reason);
    }

    if (
      notesResult.status === "fulfilled" &&
      directoriesResult.status === "fulfilled"
    ) {
      get().syncFromDb(
        notesResult.value,
        directoriesResult.value,
        tagsResult.status === "fulfilled" ? tagsResult.value : undefined,
      );
      return {
        ok: true,
        failed,
      } satisfies SyncRefreshResult;
    }

    return {
      ok: false,
      failed,
    } satisfies SyncRefreshResult;
  },
});
