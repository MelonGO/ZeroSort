/**
 * Tests for semantic Chart.js color defaults derived from the active theme.
 */
/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getChartBackgroundColors,
  getChartColors,
  parseChartConfig,
} from "@/lib/visualization/chartjs";

const baseConfig = {
  data: {
    labels: ["Jan", "Feb", "Mar"],
    datasets: [{ label: "Revenue", data: [10, 20, 30] }],
  },
};

describe("chartjs semantic color defaults", () => {
  const originalStyle = document.documentElement.getAttribute("style");

  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.style.setProperty("--chart-1", "#d47a44");
    document.documentElement.style.setProperty("--chart-2", "#007eda");
    document.documentElement.style.setProperty("--chart-3", "#596d33");
    document.documentElement.style.setProperty("--chart-4", "#dac5aa");
    document.documentElement.style.setProperty("--chart-5", "#1f2737");
  });

  afterEach(() => {
    if (originalStyle === null) {
      document.documentElement.removeAttribute("style");
      return;
    }

    document.documentElement.setAttribute("style", originalStyle);
  });

  it("Should resolve chart colors from semantic root variables", () => {
    expect(getChartColors()).toEqual([
      "rgb(212, 122, 68)",
      "rgb(0, 126, 218)",
      "rgb(89, 109, 51)",
      "rgb(218, 197, 170)",
      "rgb(31, 39, 55)",
    ]);
  });

  it("Should derive translucent backgrounds from semantic root variables", () => {
    expect(getChartBackgroundColors()).toEqual([
      "rgba(212, 122, 68, 0.2)",
      "rgba(0, 126, 218, 0.2)",
      "rgba(89, 109, 51, 0.2)",
      "rgba(218, 197, 170, 0.2)",
      "rgba(31, 39, 55, 0.2)",
    ]);
  });

  it("Should apply semantic defaults when dataset colors are missing", () => {
    const parsed = parseChartConfig(JSON.stringify(baseConfig));
    expect(parsed).not.toBeNull();

    const dataset = parsed!.data.datasets[0];
    expect(dataset.borderColor).toBe("rgb(212, 122, 68)");
    expect(dataset.backgroundColor).toBe("rgba(212, 122, 68, 0.2)");
  });

  it("Should preserve explicit dataset colors", () => {
    const parsed = parseChartConfig(
      JSON.stringify({
        data: {
          labels: ["Jan", "Feb"],
          datasets: [
            {
              label: "Revenue",
              data: [10, 20],
              borderColor: "#123456",
              backgroundColor: "rgba(18, 52, 86, 0.4)",
            },
          ],
        },
      }),
    );

    expect(parsed).not.toBeNull();

    const dataset = parsed!.data.datasets[0];
    expect(dataset.borderColor).toBe("#123456");
    expect(dataset.backgroundColor).toBe("rgba(18, 52, 86, 0.4)");
  });

  it("Should apply semantic arrays for pie chart defaults", () => {
    const parsed = parseChartConfig(
      JSON.stringify({
        type: "pie",
        data: {
          labels: ["A", "B", "C", "D", "E", "F"],
          datasets: [{ label: "Distribution", data: [1, 2, 3, 4, 5, 6] }],
        },
      }),
    );

    expect(parsed).not.toBeNull();

    const dataset = parsed!.data.datasets[0];
    expect(dataset.borderColor).toEqual([
      "rgb(212, 122, 68)",
      "rgb(0, 126, 218)",
      "rgb(89, 109, 51)",
      "rgb(218, 197, 170)",
      "rgb(31, 39, 55)",
      "rgb(212, 122, 68)",
    ]);
    expect(dataset.backgroundColor).toEqual([
      "rgba(212, 122, 68, 0.2)",
      "rgba(0, 126, 218, 0.2)",
      "rgba(89, 109, 51, 0.2)",
      "rgba(218, 197, 170, 0.2)",
      "rgba(31, 39, 55, 0.2)",
      "rgba(212, 122, 68, 0.2)",
    ]);
  });

  it("Should reflect updated theme variables on subsequent parses", () => {
    const initial = parseChartConfig(JSON.stringify(baseConfig));
    expect(initial?.data.datasets[0].borderColor).toBe("rgb(212, 122, 68)");

    document.documentElement.style.setProperty("--chart-1", "#d976e0");

    const updated = parseChartConfig(JSON.stringify(baseConfig));
    expect(updated?.data.datasets[0].borderColor).toBe("rgb(217, 118, 224)");
    expect(updated?.data.datasets[0].backgroundColor).toBe(
      "rgba(217, 118, 224, 0.2)",
    );
  });
});
