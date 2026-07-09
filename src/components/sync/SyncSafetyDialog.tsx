import type { SafetyReport } from "@/lib/sync/guards";
import { AlertTriangle } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface SyncSafetyDialogProps {
  /** The safety report containing the blocking safety check */
  safetyReport: SafetyReport;
  /** Called when the user confirms to proceed despite the warning */
  onConfirm: () => void;
  /** Called when the user cancels the sync */
  onCancel: () => void;
}

/** Warning dialog shown when a sync operation is blocked by safety checks. */
export function SyncSafetyDialog({
  safetyReport,
  onConfirm,
  onCancel,
}: SyncSafetyDialogProps) {
  const { t } = useTranslation();

  const { localDeleteCount, remoteDeleteCount, totalItems, unsafeCount } =
    safetyReport.summary;
  const totalDeletions = localDeleteCount + remoteDeleteCount;
  const deletePercentage =
    totalItems > 0 ? ((totalDeletions / totalItems) * 100).toFixed(1) : "0";

  const failedDangerCheck = safetyReport.checks.find(
    (c) => c.severity === "danger" && !c.passed,
  );
  const isUnsafeState =
    unsafeCount > 0 || failedDangerCheck?.code === "unsafe_entities" || false;
  const thresholdMatch = failedDangerCheck?.details?.match(/(\d+)%\s*safety/);
  const threshold = thresholdMatch ? thresholdMatch[1] : "30";
  const issueDetails = failedDangerCheck?.details
    ?.split("; ")
    .map((detail) => detail.trim())
    .filter(Boolean);
  const title = isUnsafeState
    ? t("sync.safetyDialog.unsafe.title")
    : t("sync.safetyDialog.deletion.title");
  const description = isUnsafeState
    ? failedDangerCheck?.details ||
      t("sync.safetyDialog.unsafe.description", {
        count: unsafeCount,
      })
    : t("sync.safetyDialog.deletion.description", {
        count: totalDeletions,
        total: totalItems,
        percentage: deletePercentage,
        threshold,
      });

  return createPortal(
    <div className="fixed inset-0 z-100 flex animate-in items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] duration-200 fade-in">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-100 overflow-y-auto animate-in rounded-2xl bg-background p-6 shadow-2xl duration-200 zoom-in-95">
        <div className="mb-4 flex items-center space-x-3">
          <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-bold">{title}</h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {isUnsafeState ? (
              <>
                <div className="text-muted-foreground">
                  {t("sync.safetyDialog.unsafe.unsafeItems")}
                </div>
                <div className="font-medium">{unsafeCount}</div>
              </>
            ) : (
              <>
                <div className="text-muted-foreground">
                  {t("sync.safetyDialog.deletion.localDeletes")}
                </div>
                <div className="font-medium">{localDeleteCount}</div>
                <div className="text-muted-foreground">
                  {t("sync.safetyDialog.deletion.remoteDeletes")}
                </div>
                <div className="font-medium">{remoteDeleteCount}</div>
              </>
            )}
            <div className="text-muted-foreground">
              {t("sync.safetyDialog.common.totalItems")}
            </div>
            <div className="font-medium">{totalItems}</div>
          </div>
          {isUnsafeState && issueDetails && issueDetails.length > 0 && (
            <div className="mt-4 border-t border-destructive/20 pt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive/80">
                {t("sync.safetyDialog.unsafe.details")}
              </div>
              <div className="space-y-2 text-sm text-foreground/90">
                {issueDetails.map((detail) => (
                  <p key={detail} className="break-all leading-relaxed">
                    {detail}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col space-y-2">
          {safetyReport.confirmable && !isUnsafeState && (
            <button
              type="button"
              onClick={onConfirm}
              className="flex w-full items-center justify-center rounded-xl bg-destructive px-4 py-3 font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              {t("sync.safetyDialog.common.confirm")}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl bg-muted px-4 py-3 font-semibold transition-colors hover:bg-muted/80"
          >
            {t(
              isUnsafeState
                ? "sync.safetyDialog.common.close"
                : "sync.safetyDialog.common.cancel",
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
