import { copyAtomNodeMarkdownToClipboard } from "@/components/tiptap/nodeClipboard";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { cn } from "@/lib/utils";
import {
  ensureMarkmapAssetsLoaded,
  transformer,
} from "@/lib/visualization/markmap";
import { type ReactNodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Copy, SquareSquare, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Markmap } from "markmap-view";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const MIN_HEIGHT = 150;
const DEFAULT_HEIGHT = 300;
const UPDATE_DEBOUNCE_MS = 100;
const INIT_DELAY_MS = 50;

/** Renders an interactive Markmap node view inside Tiptap. */
export function MarkmapNodeView({
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

  useEffect(() => {
    ensureMarkmapAssetsLoaded();
  }, []);

  const mmRef = useRef<Markmap | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const hasFittedRef = useRef(false);
  const isInitializedRef = useRef(false);
  const initContentRef = useRef<string>(currentContent);

  const [currentHeight, setCurrentHeight] = useState(height);
  const [isResizing, setIsResizing] = useState(false);
  const resizeInfo = useRef({ startY: 0, startHeight: 0 });

  useEffect(() => {
    const container = containerElRef.current;
    if (!container) return;

    const handleWheelCapture = (event: WheelEvent) => {
      event.stopPropagation();
    };

    container.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: true,
    });

    return () => {
      container.removeEventListener("wheel", handleWheelCapture, {
        capture: true,
      });
    };
  }, []);

  const initializeMarkmap = useCallback(() => {
    const container = containerElRef.current;
    if (!container || isInitializedRef.current) return;

    const svg = container.querySelector("svg");
    if (!svg) return;

    isInitializedRef.current = true;
    svgRef.current = svg;
    mmRef.current = Markmap.create(svg, {
      autoFit: false,
      duration: 200,
    });

    const contentToRender = initContentRef.current;
    if (contentToRender) {
      const { root } = transformer.transform(contentToRender);
      mmRef.current.setData(root).then(() => {
        mmRef.current?.fit();
        hasFittedRef.current = true;
      });
    }
  }, []);

  const cleanupMarkmap = useCallback(() => {
    if (mmRef.current) {
      mmRef.current.destroy();
      mmRef.current = null;
    }
    svgRef.current = null;
    hasFittedRef.current = false;
    isInitializedRef.current = false;
  }, []);

  const containerRef = useCallback(
    (container: HTMLDivElement | null) => {
      if (container) {
        containerElRef.current = container;
        const timeoutId = setTimeout(() => {
          requestAnimationFrame(() => {
            initializeMarkmap();
          });
        }, INIT_DELAY_MS);

        (
          container as HTMLDivElement & {
            _initTimeout?: ReturnType<typeof setTimeout>;
          }
        )._initTimeout = timeoutId;
      } else {
        const prevContainer = containerElRef.current as
          | (HTMLDivElement & { _initTimeout?: ReturnType<typeof setTimeout> })
          | null;
        if (prevContainer?._initTimeout) {
          clearTimeout(prevContainer._initTimeout);
        }
        containerElRef.current = null;
        cleanupMarkmap();
      }
    },
    [cleanupMarkmap, initializeMarkmap],
  );

  const applyDarkModeStyles = useCallback(() => {
    const svg = svgRef.current;

    if (svg) {
      const textColor = isDark ? "#e5e5e5" : "#1c1917";
      svg.style.setProperty("--markmap-text-color", textColor);

      svg.querySelectorAll("text").forEach((text) => {
        text.style.fill = textColor;
      });

      const circleStroke = isDark ? "#525252" : "#d6d3d1";
      svg.querySelectorAll("circle").forEach((circle) => {
        if (circle.getAttribute("fill") === "#fff") {
          circle.setAttribute("fill", isDark ? "#1c1917" : "#fff");
          circle.setAttribute("stroke", circleStroke);
        }
      });
    }
  }, [isDark]);

  useEffect(() => {
    if (!mmRef.current || !currentContent) return;

    const handler = setTimeout(() => {
      const { root } = transformer.transform(currentContent);

      mmRef.current?.setData(root).then(() => {
        applyDarkModeStyles();
      });

      if (!hasFittedRef.current) {
        mmRef.current?.fit();
        hasFittedRef.current = true;
      }
    }, UPDATE_DEBOUNCE_MS);

    return () => clearTimeout(handler);
  }, [applyDarkModeStyles, currentContent]);

  useEffect(() => {
    applyDarkModeStyles();
  }, [applyDarkModeStyles]);

  const handleCopy = useCallback(async () => {
    const didCopy = await copyAtomNodeMarkdownToClipboard({
      nodeName: "markmap",
      attrs: {
        content: currentContent,
        height: currentHeight,
      },
    });

    if (didCopy) {
      toast.success(t("editor.markmap.copied"));
      return;
    }

    toast.error(t("editor.copyFailed"));
  }, [currentContent, currentHeight, t]);

  const handleZoomIn = useCallback(() => {
    mmRef.current?.rescale(1.25);
  }, []);

  const handleZoomOut = useCallback(() => {
    mmRef.current?.rescale(0.8);
  }, []);

  const handleFit = useCallback(() => {
    mmRef.current?.fit();
  }, []);

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
      requestAnimationFrame(() => {
        mmRef.current?.fit();
      });
    },
    [currentHeight, isResizing, updateAttributes],
  );

  return (
    <NodeViewWrapper
      className={cn("markmap-node group relative", selected && "selected")}
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
          onClick={handleZoomOut}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.markmap.zoomOut")}
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.markmap.zoomIn")}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={handleFit}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.markmap.fit")}
        >
          <SquareSquare size={16} />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={t("editor.markmap.copy")}
        >
          <Copy size={16} />
        </button>
        <div className="ml-auto">
          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("editor.markmap.delete")}
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
        <svg className="h-full w-full" />
      </div>

      <button
        type="button"
        className={cn("markmap-resize-handle", isResizing && "resizing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Resize markmap"
      />
    </NodeViewWrapper>
  );
}
