import React from "react";
import { useTranslation } from "react-i18next";

import { mergeDeep } from "@/lib/utils";
import {
  getChartThemeOptions,
  parseChartConfig,
} from "@/lib/visualization/chartjs";

import { BarChart3, Loader2 } from "lucide-react";

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

import { PreviewFooter, PreviewHeader } from "./PreviewShared";

// ---------------------------------------------------------------------------
// ChartPreviewBody (internal)
// ---------------------------------------------------------------------------

interface ChartPreviewBodyProps {
  chartContent: string;
  isLoading?: boolean;
}

const ChartPreviewBody: React.FC<ChartPreviewBodyProps> = ({
  chartContent,
  isLoading,
}) => {
  const { t } = useTranslation();
  const parsed = parseChartConfig(chartContent);

  if (!parsed) {
    if (isLoading) {
      return (
        <div className="flex h-48 items-center justify-center">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("aiMenu.chartParseError")}
      </div>
    );
  }

  const chartType = parsed.type || "line";
  const isDark = document.documentElement.classList.contains("dark");
  const themeOpts = getChartThemeOptions(isDark, chartType);
  const userOpts = (parsed.options || {}) as Record<string, unknown>;
  const opts = mergeDeep(
    mergeDeep({ responsive: true, maintainAspectRatio: false }, userOpts),
    themeOpts,
  );

  switch (chartType) {
    case "bar":
      return (
        <React.Suspense fallback={null}>
          <LazyBar data={parsed.data} options={opts} />
        </React.Suspense>
      );
    case "pie":
      return (
        <React.Suspense fallback={null}>
          <LazyPie data={parsed.data} options={opts} />
        </React.Suspense>
      );
    case "radar":
      return (
        <React.Suspense fallback={null}>
          <LazyRadar data={parsed.data} options={opts} />
        </React.Suspense>
      );
    case "bubble":
      return (
        <React.Suspense fallback={null}>
          <LazyBubble data={parsed.data} options={opts} />
        </React.Suspense>
      );
    case "line":
    default:
      return (
        <React.Suspense fallback={null}>
          <LazyLine data={parsed.data} options={opts} />
        </React.Suspense>
      );
  }
};

// ---------------------------------------------------------------------------
// ChartPreview
// ---------------------------------------------------------------------------

interface ChartPreviewProps {
  chartContent: string;
  isLoading: boolean;
  onDiscard: () => void;
  onInsertAtPosition: () => void;
  onInterrupt?: () => void;
}

export const ChartPreview: React.FC<ChartPreviewProps> = ({
  chartContent,
  isLoading,
  onDiscard,
  onInsertAtPosition,
  onInterrupt,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewHeader
        icon={<BarChart3 size={12} />}
        iconColor="text-orange-500"
        label={t("aiMenu.chartPreview")}
        isLoading={isLoading}
        onClose={onDiscard}
        onInterrupt={onInterrupt}
      />
      <div className="min-h-48 flex-1 overflow-hidden p-3">
        <ChartPreviewBody chartContent={chartContent} isLoading={isLoading} />
      </div>
      <PreviewFooter
        onDiscard={onDiscard}
        onInsertAtPosition={onInsertAtPosition}
        isLoading={isLoading}
      />
    </div>
  );
};
