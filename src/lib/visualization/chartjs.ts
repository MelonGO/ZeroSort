import {
  ArcElement,
  BarElement,
  BubbleController,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip,
} from "chart.js";
import * as culori from "culori";

/**
 * Register all required Chart.js components globally.
 * Includes components for Line, Bar, Pie, Radar, and Bubble charts.
 * This must be called before any chart rendering occurs.
 */
ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  BubbleController,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const CHART_COLOR_VARIABLES = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

const FALLBACK_CHART_COLORS = [
  "rgb(234, 179, 8)",
  "rgb(99, 102, 241)",
  "rgb(168, 162, 158)",
  "rgb(231, 229, 228)",
  "rgb(120, 113, 108)",
];

const formatChartColor = (color: string): string => {
  const parsed = culori.parse(color);
  return parsed ? culori.formatRgb(parsed) : color;
};

const withAlpha = (color: string, alpha: number): string => {
  const parsed = culori.parse(color);
  if (!parsed) return color;

  return culori.formatRgb({ ...parsed, alpha });
};

/** Resolves the active semantic chart palette from root CSS variables. */
export const getChartColors = (): string[] => {
  if (typeof window === "undefined") {
    return FALLBACK_CHART_COLORS;
  }

  const rootStyles = getComputedStyle(document.documentElement);

  return CHART_COLOR_VARIABLES.map((variableName, index) => {
    const colorValue = rootStyles.getPropertyValue(variableName).trim();
    if (!colorValue) {
      return FALLBACK_CHART_COLORS[index];
    }

    return formatChartColor(colorValue);
  });
};

/** Returns translucent fills derived from the active semantic chart palette. */
export const getChartBackgroundColors = (): string[] =>
  getChartColors().map((color) => withAlpha(color, 0.2));

/** Supported chart types for the chart node. */
export type ChartType = "line" | "bar" | "pie" | "radar" | "bubble";

/** All available chart types as a constant array. */
export const CHART_TYPES: ChartType[] = [
  "line",
  "bar",
  "pie",
  "radar",
  "bubble",
];

/**
 * A single data point for a Bubble chart dataset.
 * Each point has x/y coordinates and a radius (r).
 */
export interface BubbleDataPoint {
  x: number;
  y: number;
  r: number;
}

/**
 * Shape of the chart configuration stored in the Tiptap node attribute.
 * This is a subset of the full Chart.js configuration, supporting
 * Line, Bar, Pie, Radar, and Bubble chart types.
 */
export interface ChartConfig {
  /** The chart type. Defaults to "line" when not specified. */
  type?: ChartType;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[] | BubbleDataPoint[];
      borderColor?: string;
      backgroundColor?: string;
      tension?: number;
      fill?: boolean;
      [key: string]: unknown;
    }>;
  };
  options?: Record<string, unknown>;
}

/**
 * Parses a JSON string from AI-generated output into a validated ChartConfig.
 * Handles common AI response quirks like markdown code fences, extra whitespace,
 * and missing optional fields.
 *
 * @param jsonString - Raw JSON string, possibly wrapped in markdown code fences
 * @returns Parsed and validated ChartConfig, or null if parsing fails
 */
export const parseChartConfig = (jsonString: string): ChartConfig | null => {
  try {
    // Strip markdown code fences if present
    let cleaned = jsonString.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\s*\n?/, "")
        .replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(cleaned);

    // Validate required structure
    if (
      !parsed.data ||
      !Array.isArray(parsed.data.labels) ||
      !Array.isArray(parsed.data.datasets)
    ) {
      return null;
    }

    // Normalise the type field (default to "line" for backward compatibility)
    if (!parsed.type || !CHART_TYPES.includes(parsed.type)) {
      parsed.type = "line";
    }

    const chartType = parsed.type as ChartType;
    const isPie = chartType === "pie";
    const chartColors = getChartColors();
    const chartBackgroundColors = getChartBackgroundColors();

    // Ensure each dataset has required fields
    for (const [idx, dataset] of parsed.data.datasets.entries()) {
      if (!Array.isArray(dataset.data)) {
        return null;
      }

      if (isPie) {
        // Pie charts use an array of colors, one per data point
        if (
          !dataset.backgroundColor ||
          !Array.isArray(dataset.backgroundColor)
        ) {
          dataset.backgroundColor = dataset.data.map(
            (_: unknown, i: number) =>
              chartBackgroundColors[i % chartBackgroundColors.length],
          );
        }
        if (!dataset.borderColor || !Array.isArray(dataset.borderColor)) {
          dataset.borderColor = dataset.data.map(
            (_: unknown, i: number) => chartColors[i % chartColors.length],
          );
        }
      } else {
        if (!dataset.borderColor) {
          dataset.borderColor = chartColors[idx % chartColors.length];
        }
        if (!dataset.backgroundColor) {
          dataset.backgroundColor =
            chartBackgroundColors[idx % chartBackgroundColors.length];
        }
      }

      // tension and fill only apply to line charts
      if (chartType === "line") {
        if (dataset.tension === undefined) {
          dataset.tension = 0.4;
        }
        if (dataset.fill === undefined) {
          dataset.fill = false;
        }
      }
    }

    return parsed as ChartConfig;
  } catch {
    return null;
  }
};

/**
 * Returns Chart.js options adapted for dark or light mode.
 * Adjusts grid colors, tick colors, and legend text colors.
 * Handles different scale configurations per chart type:
 * - Pie charts have no axes
 * - Radar charts use a radial scale instead of x/y
 * - Line, Bar, and Bubble charts use standard x/y axes
 *
 * @param isDark - Whether the app is in dark mode
 * @param chartType - The chart type (defaults to "line")
 */
export const getChartThemeOptions = (
  isDark: boolean,
  chartType: ChartType = "line",
): Record<string, unknown> => {
  const textColor = isDark ? "#e5e5e5" : "#1c1917";
  const gridColor = isDark
    ? "rgba(82, 82, 82, 0.3)"
    : "rgba(214, 211, 209, 0.5)";

  const plugins = {
    legend: {
      labels: { color: textColor },
    },
    title: {
      color: textColor,
    },
  };

  // Pie charts have no axes
  if (chartType === "pie") {
    return { plugins };
  }

  // Radar charts use a radial scale
  if (chartType === "radar") {
    return {
      scales: {
        r: {
          ticks: { color: textColor, backdropColor: "transparent" },
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: textColor },
        },
      },
      plugins,
    };
  }

  // Line, Bar, and Bubble charts use x/y axes
  return {
    scales: {
      x: {
        ticks: { color: textColor },
        grid: { color: gridColor },
      },
      y: {
        ticks: { color: textColor },
        grid: { color: gridColor },
      },
    },
    plugins,
  };
};
