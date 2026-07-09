import { EmbeddedEventCalendar } from "@/components/calendar-pro/EmbeddedEventCalendar";
import { copyAtomNodeMarkdownToClipboard } from "@/components/tiptap/nodeClipboard";
import { useLicenseGate } from "@/hooks/useLicenseGate";
import {
  normalizeCalendarNodeData,
  serializeCalendarNodeData,
} from "@/lib/calendar/calendarData";
import type { CalendarNodeData } from "@/lib/calendar/types";
import { showProFeatureLockedToast } from "@/lib/proFeatureGate";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CalendarDays, Copy, LockKeyhole, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MIN_HEIGHT = 600;
const DEFAULT_HEIGHT = 1280;
const SAVE_DEBOUNCE_MS = 350;

/** Renders an embedded event calendar block inside the Tiptap editor. */
export function CalendarNodeView({
  node,
  deleteNode,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isLicensed } = useLicenseGate();
  const { calendarData: calendarDataString, height: nodeHeight } = node.attrs;
  const initialHeight = (nodeHeight as number) || DEFAULT_HEIGHT;
  const [calendarData, setCalendarData] = useState<CalendarNodeData>(() =>
    normalizeCalendarNodeData(calendarDataString),
  );
  const [currentHeight, setCurrentHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeInfo = useRef({ startY: 0, startHeight: initialHeight });
  const latestSerializedDataRef = useRef(
    serializeCalendarNodeData(calendarData),
  );

  useEffect(() => {
    const nextData = normalizeCalendarNodeData(calendarDataString);
    const nextSerializedData = serializeCalendarNodeData(nextData);

    if (nextSerializedData !== latestSerializedDataRef.current) {
      latestSerializedDataRef.current = nextSerializedData;
      setCalendarData(nextData);
    }
  }, [calendarDataString]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const persistCalendarData = useCallback(
    (nextData: CalendarNodeData) => {
      const serializedData = serializeCalendarNodeData(nextData);
      latestSerializedDataRef.current = serializedData;
      setCalendarData(nextData);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        updateAttributes({ calendarData: serializedData });
      }, SAVE_DEBOUNCE_MS);
    },
    [updateAttributes],
  );

  const handleCopy = useCallback(async () => {
    const didCopy = await copyAtomNodeMarkdownToClipboard({
      nodeName: "calendar",
      attrs: {
        calendarData: latestSerializedDataRef.current,
        height: currentHeight,
      },
    });

    if (didCopy) {
      toast.success(t("editor.calendar.copied"));
      return;
    }

    toast.error(t("editor.copyFailed"));
  }, [currentHeight, t]);

  const openLicenseSettings = useCallback(() => {
    void navigate({ to: "/settings/license" });
  }, [navigate]);

  const handleLockedClick = useCallback(() => {
    showProFeatureLockedToast(
      t("editor.calendar.blockLabel"),
      openLicenseSettings,
    );
  }, [openLicenseSettings, t]);

  const handlePointerDown = (event: React.PointerEvent) => {
    const target = event.currentTarget as HTMLButtonElement;
    target.setPointerCapture(event.pointerId);
    setIsResizing(true);
    resizeInfo.current = {
      startY: event.clientY,
      startHeight: currentHeight,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isResizing) return;
    const deltaY = event.clientY - resizeInfo.current.startY;
    setCurrentHeight(
      Math.max(MIN_HEIGHT, resizeInfo.current.startHeight + deltaY),
    );
  };

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!isResizing) return;
      setIsResizing(false);
      (event.currentTarget as HTMLButtonElement).releasePointerCapture(
        event.pointerId,
      );
      updateAttributes({ height: currentHeight });
    },
    [currentHeight, isResizing, updateAttributes],
  );

  return (
    <NodeViewWrapper
      className={cn("calendar-node group relative", selected && "selected")}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-t-md bg-background px-2 py-1 transition-opacity",
          !selected && "opacity-0 group-hover:opacity-100",
        )}
        contentEditable={false}
      >
        <CalendarDays size={16} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {t("editor.calendar.blockLabel")}
        </span>
        <div className="ml-auto" />
        {isLicensed && (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={t("editor.calendar.copy")}
          >
            <Copy size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={deleteNode}
          className="rounded p-1 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("editor.calendar.delete")}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div
        className="overflow-hidden rounded-b-md bg-background"
        style={{ height: `${currentHeight}px` }}
        contentEditable={false}
      >
        {isLicensed ? (
          <EmbeddedEventCalendar
            data={calendarData}
            onChange={persistCalendarData}
          />
        ) : (
          <div className="flex h-full min-h-60 items-center justify-center border border-t-0 border-border bg-muted/20 p-6 text-center">
            <div className="max-w-sm space-y-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <LockKeyhole size={20} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {t("proFeatures.licenseGate.required")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("proFeatures.licenseGate.description", {
                    feature: t("editor.calendar.blockLabel"),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLockedClick}
                className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              >
                <LockKeyhole size={14} />
                <span>{t("proFeatures.licenseGate.activateButton")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {isLicensed && (
        <button
          type="button"
          className={cn("calendar-resize-handle", isResizing && "resizing")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          aria-label={t("editor.calendar.resize")}
        />
      )}
    </NodeViewWrapper>
  );
}
