import { useStore } from "@/store/useStore";
import { Loader2, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BatchProgressPanelProps {
  onCancel: () => void;
}

/**
 * Floating panel showing batch regeneration progress.
 * Renders at the bottom-left of the screen.
 */
export function BatchProgressPanel({ onCancel }: BatchProgressPanelProps) {
  const { t } = useTranslation();
  const batchJob = useStore((state) => state.batchJob);
  const clearBatchJob = useStore((state) => state.clearBatchJob);
  const notes = useStore((state) => state.notes);

  if (!batchJob) return null;

  const { totalCount, completedCount, failedCount, currentNoteIds, status } =
    batchJob;
  const processedCount = completedCount + failedCount;
  const progressPercent =
    totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const isRunning = status === "running";
  const isDone = status === "completed" || status === "cancelled";

  const currentNote =
    currentNoteIds.length === 1
      ? notes.find((n) => n.id === currentNoteIds[0])
      : null;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 animate-in rounded-xl border border-border bg-card p-4 shadow-lg duration-200 slide-in-from-bottom-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && (
            <Loader2 size={16} className="animate-spin text-primary" />
          )}
          <span className="text-sm font-semibold">
            {isRunning
              ? t("batch.inProgress")
              : status === "cancelled"
                ? t("batch.cancelledTitle")
                : t("batch.completedTitle")}
          </span>
        </div>
        {isDone && (
          <button
            type="button"
            onClick={clearBatchJob}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stats */}
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {t("batch.progress", {
            completed: processedCount,
            total: totalCount,
          })}
        </span>
        {failedCount > 0 && (
          <span className="text-destructive">
            {t("batch.failedCount", { count: failedCount })}
          </span>
        )}
      </div>

      {/* Current note(s) being processed */}
      {isRunning && currentNoteIds.length > 1 && (
        <p className="mb-3 truncate text-xs text-muted-foreground">
          {t("batch.processingMultiple", { count: currentNoteIds.length })}
        </p>
      )}
      {isRunning && currentNote && (
        <p className="mb-3 truncate text-xs text-muted-foreground">
          {t("batch.processing", { title: currentNote.title })}
        </p>
      )}

      {/* Stop button */}
      {isRunning && (
        <button
          type="button"
          onClick={onCancel}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          <Square size={12} />
          {t("batch.stop")}
        </button>
      )}
    </div>
  );
}
