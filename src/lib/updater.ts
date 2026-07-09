/**
 * Auto-updater bridge for the Tauri desktop build.
 *
 * The renderer delegates to the host via the Tauri command bridge.
 */

import {
  getAppVersionFromMain,
  invoke,
  isTauri,
  onIpcEvent,
} from "@/lib/desktop-adapter";

/** Fallback version used outside the desktop runtime. */
export const fallbackAppVersion = "0.1.0";

/** Updater UI state for the About page. */
export type UpdaterStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "error"
  | "completed";

/** Update metadata surfaced to the UI. */
export interface AvailableUpdateInfo {
  /** Currently installed application version. */
  currentVersion: string;
  /** Available update version. */
  version: string;
  /** Optional publication date. */
  date?: string;
  /** Optional release notes. */
  notes?: string;
}

/** Download progress information shown while an update is downloading. */
export interface UpdateProgress {
  /** Total bytes downloaded so far. */
  downloadedBytes: number;
  /** Total bytes expected for the update payload, if known. */
  totalBytes: number | null;
}

/** Opaque update handle returned by `checkForAppUpdate`. */
export interface Update extends AvailableUpdateInfo {}

/** Download lifecycle event used by `installAppUpdate`. */
export type DownloadEvent =
  | { event: "Started"; data: { contentLength: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: undefined };

/** Returns whether updater APIs are reachable in the current runtime. */
export function isUpdaterAvailable(): boolean {
  return isTauri();
}

/** Resolves the current application version. */
export async function getAppVersion(): Promise<string> {
  if (!isTauri()) {
    return fallbackAppVersion;
  }
  try {
    return await getAppVersionFromMain();
  } catch (error) {
    console.error("Failed to resolve app version:", error);
    return fallbackAppVersion;
  }
}

/** Checks the configured updater endpoint for a newer release. */
export async function checkForAppUpdate(): Promise<Update | null> {
  if (!isTauri()) {
    return null;
  }
  try {
    return await invoke<Update | null>("updater:check");
  } catch (error) {
    console.error("Updater check failed:", error);
    throw error;
  }
}

/** Maps the raw update metadata into the UI-friendly shape. */
export function toAvailableUpdateInfo(update: Update): AvailableUpdateInfo {
  return {
    currentVersion: update.currentVersion,
    version: update.version,
    date: update.date,
    notes: update.notes,
  };
}

interface MainUpdaterEvent {
  event:
    | "checking"
    | "available"
    | "not-available"
    | "progress"
    | "downloaded"
    | "error";
  info?: { version: string; releaseDate?: string; releaseNotes?: string };
  progress?: {
    bytesPerSecond: number;
    percent: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

/**
 * Downloads, installs, and relaunches into the new app version.
 *
 * Subscribes to updater events emitted by the host for the duration of the
 * download, then triggers `quitAndInstall` once `update-downloaded` arrives.
 */
export async function installAppUpdate(
  _update: Update,
  onProgress?: (event: DownloadEvent) => void,
): Promise<void> {
  let totalBytes: number | null = null;
  let downloadedBytes = 0;

  const downloadComplete = new Promise<void>((resolve, reject) => {
    const unsubscribe = onIpcEvent<MainUpdaterEvent>(
      "updater:event",
      (payload) => {
        switch (payload.event) {
          case "progress": {
            const progress = payload.progress;
            if (!progress) return;
            if (totalBytes === null && progress.total) {
              totalBytes = progress.total;
              onProgress?.({
                event: "Started",
                data: { contentLength: totalBytes },
              });
            }
            const delta = Math.max(0, progress.transferred - downloadedBytes);
            downloadedBytes = progress.transferred;
            if (delta > 0) {
              onProgress?.({
                event: "Progress",
                data: { chunkLength: delta },
              });
            }
            break;
          }
          case "downloaded": {
            onProgress?.({ event: "Finished" });
            unsubscribe();
            resolve();
            break;
          }
          case "error": {
            unsubscribe();
            reject(new Error(payload.error || "Updater error"));
            break;
          }
        }
      },
    );
  });

  await invoke("updater:download_and_install");
  await downloadComplete;
  await invoke("updater:quit_and_install");
}
