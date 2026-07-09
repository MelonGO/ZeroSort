import { copyAtomNodeMarkdownToClipboard } from "@/components/tiptap/nodeClipboard";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { cn } from "@/lib/utils";
import { type ReactNodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Code,
  Copy,
  Eye,
  SquareSquare,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MIN_HEIGHT = 150;
const DEFAULT_HEIGHT = 300;
const UPDATE_DEBOUNCE_MS = 100;

let renderCounter = 0;

/** Renders an interactive Mermaid node view inside Tiptap. */
export function MermaidNodeView({
  node,
  deleteNode,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const { content, height: nodeHeight } = node.attrs;
  const currentContent = content as string;
  const height = (nodeHeight as number) || DEFAULT_HEIGHT;
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentHeight, setCurrentHeight] = useState(height);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentContent);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const resizeInfo = useRef({ startY: 0, startHeight: 0 });

  useEffect(() => {
    if (!isEditing) {
      setEditValue(currentContent);
    }
  }, [currentContent, isEditing]);

  useEffect(() => {
    if (isEditing || !currentContent || !containerRef.current) return;

    const handler = setTimeout(async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
          suppressErrorRendering: true,
        });

        const id = `mermaid-render-${++renderCounter}`;
        const { svg } = await mermaid.render(id, currentContent);

        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (error) {
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
        setError(
          error instanceof Error ? error.message : "Invalid mermaid syntax",
        );
      }
    }, UPDATE_DEBOUNCE_MS);

    return () => clearTimeout(handler);
  }, [currentContent, isDark, isEditing]);

  const handleZoomIn = useCallback(() => {
    setZoom((value) => Math.min(value * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((value) => Math.max(value * 0.8, 0.2));
  }, []);

  const handleZoomFit = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleCopy = useCallback(async () => {
    const didCopy = await copyAtomNodeMarkdownToClipboard({
      nodeName: "mermaidDiagram",
      attrs: {
        content: currentContent,
        height: currentHeight,
      },
    });

    if (didCopy) {
      toast.success(t("editor.mermaid.copied"));
      return;
    }

    toast.error(t("editor.copyFailed"));
  }, [currentContent, currentHeight, t]);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setZoom((value) => Math.min(Math.max(value * factor, 0.2), 5));
    }
  }, []);

  const handlePanPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      isPanningRef.current = true;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [pan],
  );

  const handlePanPointerMove = useCallback((event: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    const dx = event.clientX - panStartRef.current.x;
    const dy = event.clientY - panStartRef.current.y;
    setPan({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  }, []);

  const handlePanPointerUp = useCallback((event: React.PointerEvent) => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }, []);

  const handleStartEditing = useCallback(() => {
    setEditValue(currentContent);
    setIsEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [currentContent]);

  const handleStopEditing = useCallback(() => {
    setIsEditing(false);
    if (editValue !== currentContent) {
      updateAttributes({ content: editValue });
    }
  }, [currentContent, editValue, updateAttributes]);

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
      className={cn(
        "mermaid-diagram-node group relative",
        selected && "selected",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-t-md bg-background px-2 py-1 transition-opacity",
          !isEditing && !selected && "opacity-0 group-hover:opacity-100",
        )}
        contentEditable={false}
      >
        <button
          type="button"
          onClick={isEditing ? handleStopEditing : handleStartEditing}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={
            isEditing ? t("editor.mermaid.preview") : t("editor.mermaid.edit")
          }
        >
          {isEditing ? <Eye size={16} /> : <Code size={16} />}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.mermaid.copy")}
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.mermaid.zoomOut")}
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.mermaid.zoomIn")}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={handleZoomFit}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.mermaid.fit")}
        >
          <SquareSquare size={16} />
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("editor.mermaid.delete")}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-b-md bg-background"
        style={{ height: `${currentHeight}px` }}
        contentEditable={false}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            className="h-full w-full resize-none border-0 bg-transparent p-4 font-mono text-sm outline-none"
            spellCheck={false}
          />
        ) : (
          <div
            className="h-full w-full overflow-hidden"
            onWheel={handleWheel}
            onPointerDown={handlePanPointerDown}
            onPointerMove={handlePanPointerMove}
            onPointerUp={handlePanPointerUp}
          >
            <div
              className="h-full w-full origin-center"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <div ref={containerRef} className="h-full w-full" />
            </div>
          </div>
        )}
      </div>

      {error && !isEditing && (
        <div
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          contentEditable={false}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        className={cn("mermaid-resize-handle", isResizing && "resizing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Resize mermaid diagram"
      />
    </NodeViewWrapper>
  );
}
