import { copyAtomNodeMarkdownToClipboard } from "@/components/tiptap/nodeClipboard";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { cn } from "@/lib/utils";
import { Excalidraw } from "@excalidraw/excalidraw";
import { type ReactNodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Copy, Pencil, Trash2 } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 500;
const SAVE_DEBOUNCE_MS = 500;
const appStateKeysToPersist = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
  "zenModeEnabled",
] as const;

function filterReferencedFiles(
  elements: readonly any[],
  files: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!files || Object.keys(files).length === 0) return undefined;

  const referencedIds = new Set<string>();
  for (const element of elements) {
    if (element.fileId) {
      referencedIds.add(element.fileId as string);
    }
  }

  if (referencedIds.size === 0) return undefined;

  const filtered: Record<string, unknown> = {};
  for (const id of referencedIds) {
    if (id in files) {
      filtered[id] = files[id];
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function stripAppState(
  appState: Record<string, unknown>,
): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const key of appStateKeysToPersist) {
    if (key in appState) {
      stripped[key] = appState[key];
    }
  }
  return stripped;
}

/** Renders an interactive Excalidraw node view inside Tiptap. */
export function ExcalidrawNodeView({
  node,
  deleteNode,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const { sceneData: sceneDataString, height: nodeHeight } = node.attrs;
  const height = (nodeHeight as number) || DEFAULT_HEIGHT;
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();

  const [currentHeight, setCurrentHeight] = useState(height);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const excalidrawAPIRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeInfo = useRef({ startY: 0, startHeight: 0 });
  const hasLoadedRef = useRef(false);

  const sceneData = useMemo(() => {
    if (!sceneDataString) {
      return { initialData: undefined, hasContent: false };
    }

    try {
      const parsed = JSON.parse(sceneDataString as string);
      const elements = parsed.elements || [];
      return {
        initialData: {
          elements,
          appState: parsed.appState || {},
          files: parsed.files || undefined,
          scrollToContent: true,
        },
        hasContent: Array.isArray(elements) && elements.length > 0,
      };
    } catch {
      return { initialData: undefined, hasContent: false };
    }
  }, [sceneDataString]);

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        const activeElements = elements.filter(
          (element: { isDeleted?: boolean }) => !element.isDeleted,
        );

        const sceneData = {
          elements: activeElements,
          appState: stripAppState(appState as Record<string, unknown>),
          files: filterReferencedFiles(
            activeElements,
            files as Record<string, unknown> | undefined,
          ),
        };

        updateAttributes({ sceneData: JSON.stringify(sceneData) });
      }, SAVE_DEBOUNCE_MS);
    },
    [updateAttributes],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelCapture = (event: WheelEvent) => {
      event.stopPropagation();
    };

    container.addEventListener("wheel", handleWheelCapture, {
      capture: true,
    });

    return () => {
      container.removeEventListener("wheel", handleWheelCapture, {
        capture: true,
      });
    };
  }, []);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
    requestAnimationFrame(() => {
      excalidrawAPIRef.current?.refresh?.();
    });
  }, []);

  const handleStopEditing = useCallback(() => {
    setIsEditing(false);

    const api = excalidrawAPIRef.current;
    if (api) {
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      handleChange(elements, appState, files);
    }
  }, [handleChange]);

  const handleCopy = useCallback(async () => {
    const didCopy = await copyAtomNodeMarkdownToClipboard({
      nodeName: "excalidraw",
      attrs: {
        sceneData: (sceneDataString as string) || "",
        height: currentHeight,
      },
    });

    if (didCopy) {
      toast.success(t("editor.excalidraw.copied"));
      return;
    }

    toast.error(t("editor.copyFailed"));
  }, [currentHeight, sceneDataString, t]);

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
    const newHeight = Math.max(
      MIN_HEIGHT,
      resizeInfo.current.startHeight + deltaY,
    );
    setCurrentHeight(newHeight);
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
      className={cn("excalidraw-node group relative", selected && "selected")}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-t-md bg-background px-2 py-1 transition-opacity",
          !selected && "opacity-0 group-hover:opacity-100",
        )}
        contentEditable={false}
      >
        <button
          type="button"
          onClick={isEditing ? handleStopEditing : handleStartEditing}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={
            isEditing
              ? t("editor.excalidraw.done")
              : t("editor.excalidraw.edit")
          }
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.excalidraw.copy")}
        >
          <Copy size={16} />
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("editor.excalidraw.delete")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden rounded-b-md bg-background"
        style={{ height: `${currentHeight}px` }}
        contentEditable={false}
      >
        {isEditing || sceneData.hasContent ? (
          <Excalidraw
            excalidrawAPI={(api) => {
              excalidrawAPIRef.current = api;
            }}
            initialData={sceneData.initialData}
            onChange={handleChange}
            theme={isDark ? "dark" : "light"}
            viewModeEnabled={!isEditing}
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                loadScene: false,
                export: false,
                clearCanvas: isEditing,
                changeViewBackgroundColor: isEditing,
                toggleTheme: false,
              },
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            {t("editor.excalidraw.placeholder")}
          </div>
        )}
      </div>

      <button
        type="button"
        className={cn("excalidraw-resize-handle", isResizing && "resizing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Resize drawing"
      />
    </NodeViewWrapper>
  );
}
