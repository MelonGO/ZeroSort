import { SyncSafetyDialog } from "@/components/sync/SyncSafetyDialog";
import { Slider } from "@/components/ui/slider";
import {
  getSyncEncryptionPassword,
  hasSyncEncryptionPassword,
  saveSyncEncryptionPassword,
} from "@/lib/credentials";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import type { SyncProgress } from "@/types/sync";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  Cloud,
  CloudUpload,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Loader2,
  Lock as LockIcon,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

export const Route = createFileRoute("/settings/sync")({
  component: () => <SyncSettings />,
});

interface SettingItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: React.ReactNode;
  rightElement?: React.ReactNode;
  className?: string;
}

const SettingItem = ({
  icon: Icon,
  title,
  description,
  children,
  rightElement,
  className,
}: SettingItemProps) => {
  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center space-x-4">
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon size={20} />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {children}
        {rightElement}
      </div>
    </div>
  );
};

const SyncSettings = () => {
  const { t } = useTranslation();

  // Store state and actions
  const {
    syncStatus,
    incrementalSync,
    syncConcurrency,
    setSyncConcurrency,
    connectS3Sync,
    disconnectS3Sync,
    performSync,
    previewSync,
    confirmSyncDespiteSafety,
    recoverFromRemote,
    dismissSafetyDialog,
    loadSavedConnection,
  } = useStore(
    useShallow((state) => ({
      syncStatus: state.syncStatus,
      incrementalSync: state.incrementalSync,
      syncConcurrency: state.syncConcurrency,
      setSyncConcurrency: state.setSyncConcurrency,
      connectS3Sync: state.connectS3Sync,
      disconnectS3Sync: state.disconnectS3Sync,
      performSync: state.performSync,
      previewSync: state.previewSync,
      confirmSyncDespiteSafety: state.confirmSyncDespiteSafety,
      recoverFromRemote: state.recoverFromRemote,
      dismissSafetyDialog: state.dismissSafetyDialog,
      loadSavedConnection: state.loadSavedConnection,
    })),
  );

  // Local state
  const [isLoadingConnection, setIsLoadingConnection] = useState(false);
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isEncryptionDialogOpen, setIsEncryptionDialogOpen] = useState(false);
  const [hasEncryptionPassword, setHasEncryptionPassword] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showEncryptionPassword, setShowEncryptionPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSavedPassword, setShowSavedPassword] = useState(false);
  const [savedPasswordDisplay, setSavedPasswordDisplay] = useState<
    string | null
  >(null);

  // Track if we've already attempted to load the saved connection
  const hasAttemptedLoad = useRef(false);

  // Check if encryption password is set on mount
  useEffect(() => {
    hasSyncEncryptionPassword().then(setHasEncryptionPassword);
  }, []);

  // Load saved S3 connection when sync settings page is opened (only once, and only if not already connected)
  useEffect(() => {
    if (!hasAttemptedLoad.current && !syncStatus.isConnected) {
      hasAttemptedLoad.current = true;
      setIsLoadingConnection(true);
      loadSavedConnection().finally(() => {
        setIsLoadingConnection(false);
      });
    }
  }, [syncStatus.isConnected, loadSavedConnection]);

  const [config, setConfig] = useState({
    bucket_name: "",
    access_key_id: "",
    secret_access_key: "",
    endpoint_url: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
  });

  const handleConnect = async () => {
    const success = await connectS3Sync(config);
    if (success) {
      setIsConnectDialogOpen(false);
    }
  };

  const handleIncrementalSync = async () => {
    if (syncStatus.connection?.bucket_name) {
      await performSync(syncStatus.connection.bucket_name);
    }
  };

  const handlePreviewSync = async () => {
    if (syncStatus.connection?.bucket_name) {
      await previewSync(syncStatus.connection.bucket_name);
    }
  };

  const handleDisconnect = async () => {
    await disconnectS3Sync();
  };

  const handleRecoverFromRemote = async () => {
    if (syncStatus.connection?.bucket_name) {
      await recoverFromRemote(syncStatus.connection.bucket_name);
    }
  };

  const handleSaveEncryptionPassword = async () => {
    setPasswordError(null);

    // Validate password length
    if (encryptionPassword.length < 8) {
      setPasswordError(t("sync.encryption.tooShort"));
      return;
    }

    // Validate passwords match
    if (encryptionPassword !== confirmPassword) {
      setPasswordError(t("sync.encryption.mismatch"));
      return;
    }

    setIsSavingPassword(true);
    try {
      await saveSyncEncryptionPassword(encryptionPassword);
      setHasEncryptionPassword(true);
      setIsEncryptionDialogOpen(false);
      setEncryptionPassword("");
      setConfirmPassword("");
      toast.success(t("sync.encryption.saved"));
    } catch (error) {
      console.error("Failed to save encryption password:", error);
      toast.error(t("sync.errors.connectionFailed"));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const getPhaseLabel = (phase: string) => {
    const key = `sync.phase.${phase}`;
    // Fallback if key doesn't exist
    return t(key) === key ? phase : t(key);
  };

  const getProgressPercentage = (progress: SyncProgress) => {
    if (progress.total <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(100, Math.round((progress.current / progress.total) * 100)),
    );
  };

  const getProgressSummary = (progress: SyncProgress) => {
    if (progress.total <= 0) {
      return t("sync.progress.preparing");
    }

    return `${progress.current} / ${progress.total}`;
  };

  const progressPercentage = incrementalSync.progress
    ? getProgressPercentage(incrementalSync.progress)
    : 0;

  return (
    <div className="flex-1 animate-in space-y-8 overflow-y-auto pr-2 duration-500 fade-in slide-in-from-bottom-4">
      <header>
        <div className="mb-4 flex items-center space-x-2 md:hidden">
          <Link
            to="/settings"
            className="flex items-center text-[1rem] font-medium transition-colors hover:text-accent"
          >
            <ChevronLeft size={20} className="mr-1" />
            {t("settings.back")}
          </Link>
        </div>
        <div className="mb-2 flex items-center space-x-3">
          <div className="rounded-xl bg-muted p-2">
            <Cloud className="text-foreground" size={24} />
          </div>
          <h1 className="text-2xl font-bold">{t("sync.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("sync.description")}</p>
      </header>

      <section className="space-y-4">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("sync.configuration.title")}
        </h3>

        {/* Connection Status */}
        <SettingItem
          icon={
            isLoadingConnection
              ? Loader2
              : syncStatus.isConnected
                ? Cloud
                : CloudUpload
          }
          title={t("sync.title")}
          description={
            isLoadingConnection
              ? t("sync.restoring")
              : syncStatus.isConnected
                ? `${t("sync.connected")} (${syncStatus.connection?.bucket_name})`
                : t("sync.notConnected")
          }
          className={isLoadingConnection ? "[&_svg]:animate-spin" : undefined}
        >
          {syncStatus.isConnected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isLoadingConnection}
              className={cn(
                "rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors",
                isLoadingConnection
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-destructive/90",
              )}
            >
              {t("sync.disconnect")}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={isLoadingConnection}
                onClick={() => setIsConnectDialogOpen(true)}
                className={cn(
                  "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors",
                  isLoadingConnection
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-primary/90",
                )}
              >
                {t("sync.connect")}
              </button>
              {isConnectDialogOpen &&
                createPortal(
                  <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
                    <div
                      className="flex w-full max-w-xl animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
                        <h3 className="text-lg font-semibold text-foreground">
                          {t("sync.configuration.title")}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setIsConnectDialogOpen(false)}
                          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X size={20} />
                        </button>
                      </div>
                      <div className="grid gap-4 p-4">
                        <div className="grid gap-2">
                          <label
                            htmlFor="sync-endpoint"
                            className="text-sm font-medium"
                          >
                            {t("sync.configuration.endpointUrl")}
                          </label>
                          <input
                            id="sync-endpoint"
                            type="text"
                            placeholder={t(
                              "sync.configuration.endpointPlaceholder",
                            )}
                            value={config.endpoint_url}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setConfig({
                                ...config,
                                endpoint_url: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor="sync-region"
                            className="text-sm font-medium"
                          >
                            {t("sync.configuration.region")}
                          </label>
                          <input
                            id="sync-region"
                            type="text"
                            placeholder={t(
                              "sync.configuration.regionPlaceholder",
                            )}
                            value={config.region}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setConfig({
                                ...config,
                                region: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor="sync-bucket"
                            className="text-sm font-medium"
                          >
                            {t("sync.configuration.bucketName")}
                          </label>
                          <input
                            id="sync-bucket"
                            type="text"
                            placeholder={t(
                              "sync.configuration.bucketPlaceholder",
                            )}
                            value={config.bucket_name}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setConfig({
                                ...config,
                                bucket_name: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor="sync-access-key"
                            className="text-sm font-medium"
                          >
                            {t("sync.configuration.accessKeyId")}
                          </label>
                          <input
                            id="sync-access-key"
                            type="password"
                            value={config.access_key_id}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setConfig({
                                ...config,
                                access_key_id: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor="sync-secret-key"
                            className="text-sm font-medium"
                          >
                            {t("sync.configuration.secretAccessKey")}
                          </label>
                          <input
                            id="sync-secret-key"
                            type="password"
                            value={config.secret_access_key}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) =>
                              setConfig({
                                ...config,
                                secret_access_key: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      </div>
                      <div className="p-4 pt-0">
                        <button
                          type="button"
                          onClick={handleConnect}
                          disabled={syncStatus.isSyncing}
                          className={cn(
                            "w-full rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors",
                            syncStatus.isSyncing
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:bg-primary/90",
                          )}
                        >
                          {syncStatus.isSyncing ? (
                            <span className="flex items-center justify-center space-x-2">
                              <Loader2 size={16} className="animate-spin" />
                              <span>{t("sync.connecting")}</span>
                            </span>
                          ) : (
                            t("sync.connect")
                          )}
                        </button>
                      </div>
                    </div>
                    <div
                      className="absolute inset-0 -z-10"
                      onClick={() => setIsConnectDialogOpen(false)}
                    />
                  </div>,
                  document.body,
                )}
            </>
          )}
        </SettingItem>

        {/* Sync Concurrency Setting */}
        <SettingItem
          icon={Settings2}
          title={t("sync.concurrency.title")}
          description={t("sync.concurrency.description")}
        >
          <div className="flex items-center space-x-3">
            <Slider
              min={1}
              max={50}
              step={1}
              value={[syncConcurrency]}
              onValueChange={(value) => setSyncConcurrency(value[0])}
              disabled={isLoadingConnection}
              className={cn("w-24", isLoadingConnection && "opacity-50")}
            />
            <span className="w-8 text-right text-sm font-medium tabular-nums">
              {syncConcurrency}
            </span>
          </div>
        </SettingItem>

        {/* Encryption Password Setting */}
        <SettingItem
          icon={LockIcon}
          title={t("sync.encryption.title")}
          description={
            hasEncryptionPassword
              ? t("sync.encryption.configured")
              : t("sync.encryption.notConfigured")
          }
        >
          <>
            {hasEncryptionPassword && (
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm text-muted-foreground">
                  {showSavedPassword && savedPasswordDisplay
                    ? savedPasswordDisplay
                    : "••••••••"}
                </span>
                <button
                  type="button"
                  disabled={isLoadingConnection}
                  onClick={async () => {
                    if (showSavedPassword) {
                      setShowSavedPassword(false);
                      setSavedPasswordDisplay(null);
                    } else {
                      try {
                        const password = await getSyncEncryptionPassword();
                        setSavedPasswordDisplay(password);
                        setShowSavedPassword(true);
                      } catch (error) {
                        console.error(
                          "Failed to retrieve encryption password:",
                          error,
                        );
                        toast.error(t("sync.errors.connectionFailed"));
                      }
                    }
                  }}
                  className={cn(
                    "rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground",
                    isLoadingConnection && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {showSavedPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={isLoadingConnection}
              onClick={() => setIsEncryptionDialogOpen(true)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                isLoadingConnection
                  ? "opacity-50 cursor-not-allowed"
                  : hasEncryptionPassword
                    ? "border border-border bg-background hover:bg-accent/10"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {hasEncryptionPassword
                ? t("sync.encryption.change")
                : t("sync.encryption.configure")}
            </button>
            {isEncryptionDialogOpen &&
              createPortal(
                <div className="fixed inset-0 z-60 flex animate-in items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200 fade-in">
                  <div
                    className="flex w-full max-w-xl animate-in flex-col overflow-hidden rounded-2xl bg-card shadow-2xl duration-200 zoom-in-95"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {t("sync.encryption.title")}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEncryptionDialogOpen(false);
                          setEncryptionPassword("");
                          setConfirmPassword("");
                          setPasswordError(null);
                          setShowEncryptionPassword(false);
                          setShowConfirmPassword(false);
                        }}
                        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="grid gap-4 p-4">
                      <p className="text-sm text-muted-foreground">
                        {t("sync.encryption.description")}
                      </p>
                      {hasEncryptionPassword && (
                        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {t("sync.encryption.changeWarning")}
                          </p>
                        </div>
                      )}
                      <div className="grid gap-2">
                        <label
                          htmlFor="encryption-password"
                          className="text-sm font-medium"
                        >
                          {t("sync.encryption.password")}
                        </label>
                        <div className="relative">
                          <input
                            id="encryption-password"
                            type={showEncryptionPassword ? "text" : "password"}
                            value={encryptionPassword}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) => setEncryptionPassword(e.target.value)}
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 pr-10 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowEncryptionPassword(!showEncryptionPassword)
                            }
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showEncryptionPassword ? (
                              <EyeOff size={18} />
                            ) : (
                              <Eye size={18} />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label
                          htmlFor="confirm-password"
                          className="text-sm font-medium"
                        >
                          {t("sync.encryption.confirmPassword")}
                        </label>
                        <div className="relative">
                          <input
                            id="confirm-password"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(
                              e: React.ChangeEvent<HTMLInputElement>,
                            ) => setConfirmPassword(e.target.value)}
                            className="w-full rounded-xl border-none bg-muted px-4 py-3 pr-10 text-sm transition-all outline-none focus:ring-2 focus:ring-accent"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowConfirmPassword(!showConfirmPassword)
                            }
                            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showConfirmPassword ? (
                              <EyeOff size={18} />
                            ) : (
                              <Eye size={18} />
                            )}
                          </button>
                        </div>
                      </div>
                      {passwordError && (
                        <p className="text-sm text-destructive">
                          {passwordError}
                        </p>
                      )}
                    </div>
                    <div className="p-4 pt-0">
                      <button
                        type="button"
                        onClick={handleSaveEncryptionPassword}
                        disabled={isSavingPassword}
                        className={cn(
                          "w-full rounded-xl bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors",
                          isSavingPassword
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-primary/90",
                        )}
                      >
                        {isSavingPassword ? (
                          <span className="flex items-center justify-center space-x-2">
                            <Loader2 size={16} className="animate-spin" />
                            <span>{t("common.saving")}</span>
                          </span>
                        ) : (
                          t("common.save")
                        )}
                      </button>
                    </div>
                  </div>
                  <div
                    className="absolute inset-0 -z-10"
                    onClick={() => {
                      setIsEncryptionDialogOpen(false);
                      setEncryptionPassword("");
                      setConfirmPassword("");
                      setPasswordError(null);
                      setShowEncryptionPassword(false);
                      setShowConfirmPassword(false);
                    }}
                  />
                </div>,
                document.body,
              )}
          </>
        </SettingItem>

        {syncStatus.isConnected && syncStatus.connection?.bucket_name && (
          <>
            {/* Incremental Sync Controls */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <RefreshCw
                        size={24}
                        className={cn(
                          incrementalSync.isSyncing && "animate-spin",
                        )}
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">
                        {t("sync.title")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {incrementalSync.isSyncing
                          ? getPhaseLabel(incrementalSync.phase)
                          : t("sync.description")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handlePreviewSync}
                      disabled={
                        incrementalSync.isSyncing || isLoadingConnection
                      }
                      className="flex items-center space-x-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span>{t("sync.preview")}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleIncrementalSync}
                      disabled={
                        incrementalSync.isSyncing || isLoadingConnection
                      }
                      className="flex items-center space-x-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {incrementalSync.isSyncing ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <RefreshCw size={16} />
                      )}
                      <span>{t("sync.syncNow")}</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                {incrementalSync.isSyncing && incrementalSync.progress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{getPhaseLabel(incrementalSync.phase)}</span>
                      <span>{progressPercentage}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{
                          width: `${progressPercentage}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {getProgressSummary(incrementalSync.progress)}
                    </p>
                    {incrementalSync.progress.currentItem && (
                      <p className="truncate text-center text-xs text-muted-foreground/80">
                        {incrementalSync.progress.currentItem}
                      </p>
                    )}
                  </div>
                )}

                {/* Sync Preview */}
                {!incrementalSync.isSyncing && incrementalSync.lastPreview && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/50 p-4">
                    <h4 className="mb-3 text-sm font-semibold">
                      {t("sync.preview_section.title")}
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 md:grid-cols-6">
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {t("sync.preview_section.uploads")}
                        </span>
                        <div className="flex items-center space-x-1 font-medium text-blue-500">
                          <ArrowUpCircle size={14} />
                          <span>{incrementalSync.lastPreview.uploadCount}</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {t("sync.preview_section.downloads")}
                        </span>
                        <div className="flex items-center space-x-1 font-medium text-green-500">
                          <ArrowDownCircle size={14} />
                          <span>
                            {incrementalSync.lastPreview.downloadCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {t("sync.preview_section.deletes")}
                        </span>
                        <div className="flex items-center space-x-1 font-medium text-red-500">
                          <Trash2 size={14} />
                          <span>
                            {incrementalSync.lastPreview.localDeleteCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {t("sync.preview_section.remoteDeletes")}
                        </span>
                        <div className="flex items-center space-x-1 font-medium text-orange-500">
                          <Trash2 size={14} />
                          <span>
                            {incrementalSync.lastPreview.remoteDeleteCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {t("sync.preview_section.conflicts")}
                        </span>
                        <div className="flex items-center space-x-1 font-medium text-yellow-500">
                          <AlertCircle size={14} />
                          <span>
                            {incrementalSync.lastPreview.conflictCount}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">
                          {t("sync.preview_section.unsafe")}
                        </span>
                        <div className="flex items-center space-x-1 font-medium text-destructive">
                          <AlertCircle size={14} />
                          <span>{incrementalSync.lastPreview.unsafeCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Messages */}
                <div className="flex flex-col gap-2 pt-2">
                  {incrementalSync.lastSyncAt && (
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <LinkIcon size={14} />
                      <span>
                        {t("sync.lastSync", {
                          time: new Date(
                            incrementalSync.lastSyncAt,
                          ).toLocaleString(),
                        })}
                      </span>
                    </div>
                  )}

                  {incrementalSync.lastError && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                      <div className="flex items-center space-x-2 text-xs text-destructive">
                        <AlertCircle size={14} />
                        <span>{incrementalSync.lastError}</span>
                      </div>
                    </div>
                  )}

                  {incrementalSync.blockingSafetySync && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-xs font-semibold text-amber-700">
                            <AlertCircle size={14} />
                            <span>{t("sync.recovery.title")}</span>
                          </div>
                          <p className="text-xs text-amber-900/80">
                            {incrementalSync.blockingSafetySync.safetyReport.checks.find(
                              (check) =>
                                check.code === "unexpected_empty_local" &&
                                !check.passed,
                            )?.details || t("sync.recovery.description")}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRecoverFromRemote}
                          disabled={incrementalSync.isSyncing}
                          className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t("sync.recovery.action")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Safety Confirmation Dialog */}
      {incrementalSync.pendingSafetySync && (
        <SyncSafetyDialog
          safetyReport={incrementalSync.pendingSafetySync.safetyReport}
          onConfirm={confirmSyncDespiteSafety}
          onCancel={dismissSafetyDialog}
        />
      )}
    </div>
  );
};
