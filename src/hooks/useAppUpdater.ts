import {
  checkForAppUpdate,
  getAppVersion,
  installAppUpdate,
  isUpdaterAvailable,
  toAvailableUpdateInfo,
  type AvailableUpdateInfo,
  type Update,
  type UpdateProgress,
  type UpdaterStatus,
} from "@/lib/updater";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const updaterNetworkErrorPattern =
  /ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i;

function toUpdaterErrorKey(cause: unknown, fallbackKey: string): string {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");

  if (updaterNetworkErrorPattern.test(message)) {
    return "about.updater.errors.network";
  }

  return fallbackKey;
}

interface UpdaterSessionState {
  status: UpdaterStatus;
  availableUpdate: AvailableUpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  update: Update | null;
}

const initialSessionState: UpdaterSessionState = {
  status: "idle",
  availableUpdate: null,
  progress: null,
  error: null,
  update: null,
};

let updaterSessionState: UpdaterSessionState = initialSessionState;

function setUpdaterSessionState(
  updater:
    | UpdaterSessionState
    | ((current: UpdaterSessionState) => UpdaterSessionState),
): UpdaterSessionState {
  updaterSessionState =
    typeof updater === "function" ? updater(updaterSessionState) : updater;

  return updaterSessionState;
}

/** Resets cached updater session state for tests. */
export function resetAppUpdaterSessionStateForTests() {
  updaterSessionState = initialSessionState;
}

/** State returned by the desktop updater hook. */
export interface AppUpdaterState {
  /** Whether updater APIs are available in the current runtime. */
  isSupported: boolean;
  /** Current installed application version. */
  currentVersion: string;
  /** Current updater workflow status. */
  status: UpdaterStatus;
  /** Available update metadata, when present. */
  availableUpdate: AvailableUpdateInfo | null;
  /** Download progress, when downloading. */
  progress: UpdateProgress | null;
  /** Latest updater error translation key or message, if any. */
  error: string | null;
  /** Checks for a newer version. */
  checkForUpdates: () => Promise<"unsupported" | "upToDate" | "available">;
  /** Downloads and installs the available update. */
  installUpdate: () => Promise<"unsupported" | "completed">;
}

/**
 * Manages desktop update checks, progress, install, and relaunch state.
 *
 * @returns Current updater state and actions for the About page
 */
export function useAppUpdater(): AppUpdaterState {
  const isSupported = isUpdaterAvailable();
  const updateRef = useRef<Update | null>(updaterSessionState.update);
  const [currentVersion, setCurrentVersion] = useState("0.1.0");
  const [status, setStatus] = useState<UpdaterStatus>(
    updaterSessionState.status,
  );
  const [availableUpdate, setAvailableUpdate] =
    useState<AvailableUpdateInfo | null>(updaterSessionState.availableUpdate);
  const [progress, setProgress] = useState<UpdateProgress | null>(
    updaterSessionState.progress,
  );
  const [error, setError] = useState<string | null>(updaterSessionState.error);

  useEffect(() => {
    let isCancelled = false;

    void getAppVersion().then((version) => {
      if (!isCancelled) {
        startTransition(() => {
          setCurrentVersion(version);
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const checkForUpdates = useCallback(async (): Promise<
    "unsupported" | "upToDate" | "available"
  > => {
    if (!isSupported) {
      return "unsupported";
    }

    startTransition(() => {
      setStatus("checking");
      setError(null);
      setProgress(null);
    });
    setUpdaterSessionState((current) => ({
      ...current,
      status: "checking",
      error: null,
      progress: null,
    }));

    try {
      const update = await checkForAppUpdate();
      updateRef.current = update;

      if (!update) {
        setUpdaterSessionState({
          status: "upToDate",
          availableUpdate: null,
          progress: null,
          error: null,
          update: null,
        });
        startTransition(() => {
          setAvailableUpdate(null);
          setStatus("upToDate");
        });
        return "upToDate";
      }

      setUpdaterSessionState({
        status: "available",
        availableUpdate: toAvailableUpdateInfo(update),
        progress: null,
        error: null,
        update,
      });
      startTransition(() => {
        setAvailableUpdate(toAvailableUpdateInfo(update));
        setStatus("available");
      });

      return "available";
    } catch (cause) {
      const message = toUpdaterErrorKey(cause, "about.updater.errors.check");
      setUpdaterSessionState((current) => ({
        ...current,
        status: "error",
        error: message,
      }));

      startTransition(() => {
        setStatus("error");
        setError(message);
      });

      throw cause;
    }
  }, [isSupported]);

  const installUpdate = useCallback(async (): Promise<
    "unsupported" | "completed"
  > => {
    if (!isSupported || !updateRef.current) {
      return "unsupported";
    }

    let downloadedBytes = 0;

    startTransition(() => {
      setStatus("downloading");
      setError(null);
      setProgress({
        downloadedBytes: 0,
        totalBytes: null,
      });
    });
    setUpdaterSessionState((current) => ({
      ...current,
      status: "downloading",
      error: null,
      progress: {
        downloadedBytes: 0,
        totalBytes: null,
      },
    }));

    try {
      await installAppUpdate(updateRef.current, (event) => {
        switch (event.event) {
          case "Started":
            setUpdaterSessionState((current) => ({
              ...current,
              progress: {
                downloadedBytes: 0,
                totalBytes: event.data.contentLength ?? null,
              },
            }));
            startTransition(() => {
              setProgress({
                downloadedBytes: 0,
                totalBytes: event.data.contentLength ?? null,
              });
            });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            setUpdaterSessionState((current) => ({
              ...current,
              progress: {
                downloadedBytes,
                totalBytes: current.progress?.totalBytes ?? null,
              },
            }));
            startTransition(() => {
              setProgress((currentProgress) => ({
                downloadedBytes,
                totalBytes: currentProgress?.totalBytes ?? null,
              }));
            });
            break;
          case "Finished":
            setUpdaterSessionState((current) => ({
              ...current,
              status: "installing",
            }));
            startTransition(() => {
              setStatus("installing");
            });
            break;
        }
      });

      setUpdaterSessionState((current) => ({
        ...current,
        status: "completed",
      }));
      startTransition(() => {
        setStatus("completed");
      });

      return "completed";
    } catch (cause) {
      const message = toUpdaterErrorKey(cause, "about.updater.errors.install");
      setUpdaterSessionState((current) => ({
        ...current,
        status: "error",
        error: message,
      }));

      startTransition(() => {
        setStatus("error");
        setError(message);
      });

      throw cause;
    }
  }, [isSupported]);

  return {
    isSupported,
    currentVersion,
    status,
    availableUpdate,
    progress,
    error,
    checkForUpdates,
    installUpdate,
  };
}
