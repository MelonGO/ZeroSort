import { copyAtomNodeMarkdownToClipboard } from "@/components/tiptap/nodeClipboard";
import { cn } from "@/lib/utils";
import {
  type ChartConfig,
  type ChartType,
  getChartThemeOptions,
  parseChartConfig,
} from "@/lib/visualization/chartjs";
import { useThemeStore } from "@/store/useThemeStore";
import { type ReactNodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Copy, Trash2 } from "lucide-react";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const LazyBar = React.lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Bar })),
);
const LazyLine = React.lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Line })),
);
const LazyPie = React.lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Pie })),
);
const LazyRadar = React.lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Radar })),
);
const LazyBubble = React.lazy(() =>
  import("react-chartjs-2").then((m) => ({ default: m.Bubble })),
);

const MIN_HEIGHT = 200;
const DEFAULT_HEIGHT = 500;

const deepMerge = (
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    if (
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key]) &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        override[key] as Record<string, unknown>,
      );
    } else {
      result[key] = override[key];
    }
  }
  return result;
};

/** Renders an interactive Chart.js node view inside Tiptap. */
export function ChartNodeView({
  node,
  deleteNode,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const { config: configString, height: nodeHeight } = node.attrs;
  const height = (nodeHeight as number) || DEFAULT_HEIGHT;
  const { t } = useTranslation();
  const themeState = useThemeStore((state) => state.themeState);
  const isDark = themeState.currentMode === "dark";

  const [currentHeight, setCurrentHeight] = useState(height);
  const [isResizing, setIsResizing] = useState(false);
  const resizeInfo = useRef({ startY: 0, startHeight: 0 });

  const chartConfig = useMemo<ChartConfig | null>(() => {
    if (!configString) return null;
    return parseChartConfig(configString as string);
  }, [configString, themeState]);

  const chartType: ChartType = chartConfig?.type || "line";

  const mergedOptions = useMemo(() => {
    if (!chartConfig) return {};

    const themeOptions = getChartThemeOptions(isDark, chartType);
    const userOptions = (chartConfig.options || {}) as Record<string, unknown>;

    return deepMerge(
      deepMerge(
        {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
        },
        userOptions,
      ),
      themeOptions,
    );
  }, [chartConfig, chartType, isDark]);

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

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!isResizing) return;

    setIsResizing(false);
    (event.currentTarget as HTMLButtonElement).releasePointerCapture(
      event.pointerId,
    );
    updateAttributes({ height: currentHeight });
  };

  const handleCopy = useCallback(async () => {
    const didCopy = await copyAtomNodeMarkdownToClipboard({
      nodeName: "chart",
      attrs: {
        config: (configString as string) || "",
        height: currentHeight,
      },
    });

    if (didCopy) {
      toast.success(t("editor.chart.copied"));
      return;
    }

    toast.error(t("editor.copyFailed"));
  }, [configString, currentHeight, t]);

  if (!chartConfig) {
    return (
      <NodeViewWrapper
        className={cn("chart-node group relative", selected && "selected")}
        data-drag-handle
      >
        <div
          className="flex items-center justify-center rounded-md bg-background p-8 text-sm text-muted-foreground dark:bg-neutral-900"
          contentEditable={false}
        >
          Failed to render chart: invalid configuration
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={cn("chart-node group relative", selected && "selected")}
      data-drag-handle
    >
      <div
        className="chart-container relative overflow-hidden rounded-md bg-background p-3 dark:bg-neutral-900"
        style={{ height: `${currentHeight}px` }}
        contentEditable={false}
      >
        {chartType === "bar" && (
          <React.Suspense fallback={null}>
            <LazyBar data={chartConfig.data} options={mergedOptions} />
          </React.Suspense>
        )}
        {chartType === "pie" && (
          <React.Suspense fallback={null}>
            <LazyPie data={chartConfig.data} options={mergedOptions} />
          </React.Suspense>
        )}
        {chartType === "radar" && (
          <React.Suspense fallback={null}>
            <LazyRadar data={chartConfig.data} options={mergedOptions} />
          </React.Suspense>
        )}
        {chartType === "bubble" && (
          <React.Suspense fallback={null}>
            <LazyBubble data={chartConfig.data} options={mergedOptions} />
          </React.Suspense>
        )}
        {chartType === "line" && (
          <React.Suspense fallback={null}>
            <LazyLine data={chartConfig.data} options={mergedOptions} />
          </React.Suspense>
        )}

        <div
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1 transition-all",
            "opacity-0 group-hover:opacity-100",
            selected && "opacity-100",
          )}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={t("editor.chart.copy")}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            onClick={deleteNode}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete chart"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className={cn("chart-resize-handle", isResizing && "resizing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Resize chart"
      />
    </NodeViewWrapper>
  );
}
