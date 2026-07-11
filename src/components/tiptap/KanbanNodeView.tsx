import { KanbanBoard } from "@/components/kanban-pro/KanbanBoard";
import { copyAtomNodeMarkdownToClipboard } from "@/components/tiptap/nodeClipboard";
import {
  normalizeKanbanNodeData,
  serializeKanbanNodeData,
} from "@/lib/kanban/kanbanData";
import type { KanbanNodeData } from "@/lib/kanban/types";
import { cn } from "@/lib/utils";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Copy, SquareKanban, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MIN_HEIGHT = 480;
const DEFAULT_HEIGHT = 760;
const SAVE_DEBOUNCE_MS = 350;

/** Renders an embedded kanban board block inside the Tiptap editor. */
export function KanbanNodeView({
  node,
  deleteNode,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const { t } = useTranslation();
  const { kanbanData: kanbanDataString, height: nodeHeight } = node.attrs;
  const initialHeight = (nodeHeight as number) || DEFAULT_HEIGHT;
  const [kanbanData, setKanbanData] = useState<KanbanNodeData>(() =>
    normalizeKanbanNodeData(kanbanDataString),
  );
  const [currentHeight, setCurrentHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeInfo = useRef({ startY: 0, startHeight: initialHeight });
  const latestSerializedDataRef = useRef(serializeKanbanNodeData(kanbanData));

  useEffect(() => {
    const nextData = normalizeKanbanNodeData(kanbanDataString);
    const nextSerializedData = serializeKanbanNodeData(nextData);

    if (nextSerializedData !== latestSerializedDataRef.current) {
      latestSerializedDataRef.current = nextSerializedData;
      setKanbanData(nextData);
    }
  }, [kanbanDataString]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const persistKanbanData = useCallback(
    (nextData: KanbanNodeData) => {
      const serializedData = serializeKanbanNodeData(nextData);
      latestSerializedDataRef.current = serializedData;
      setKanbanData(nextData);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        updateAttributes({ kanbanData: serializedData });
      }, SAVE_DEBOUNCE_MS);
    },
    [updateAttributes],
  );

  const handleBoardChange = useCallback(
    (board: KanbanNodeData["board"]) => {
      persistKanbanData({ ...kanbanData, board });
    },
    [kanbanData, persistKanbanData],
  );

  const handleCopy = useCallback(async () => {
    const didCopy = await copyAtomNodeMarkdownToClipboard({
      nodeName: "kanban",
      attrs: {
        kanbanData: latestSerializedDataRef.current,
        height: currentHeight,
      },
    });

    if (didCopy) {
      toast.success(t("editor.kanban.copied"));
      return;
    }

    toast.error(t("editor.copyFailed"));
  }, [currentHeight, t]);

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
      className={cn("kanban-node group relative", selected && "selected")}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-t-md bg-background px-2 py-1 transition-opacity",
          !selected && "opacity-0 group-hover:opacity-100",
        )}
        contentEditable={false}
      >
        <SquareKanban size={16} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {t("editor.kanban.blockLabel")}
        </span>
        <div className="ml-auto" />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.kanban.copy")}
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          onClick={deleteNode}
          className="rounded p-1 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("editor.kanban.delete")}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div
        className="overflow-hidden rounded-b-md bg-background"
        style={{ height: `${currentHeight}px` }}
        contentEditable={false}
      >
        <KanbanBoard data={kanbanData.board} onChange={handleBoardChange} />
      </div>

      <button
        type="button"
        className={cn("kanban-resize-handle", isResizing && "resizing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label={t("editor.kanban.resize")}
      />
    </NodeViewWrapper>
  );
}
