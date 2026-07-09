import type { ColorFormat } from "@/types/theme";
import * as culori from "culori";

interface HslColor {
  h?: number;
  s?: number;
  l?: number;
}

export const formatNumber = (num?: number) => {
  if (!num) return "0";
  return num % 1 === 0 ? num : num.toFixed(4);
};

export const formatHsl = (hsl: HslColor) => {
  return `hsl(${formatNumber(hsl.h)} ${formatNumber((hsl.s ?? 0) * 100)}% ${formatNumber((hsl.l ?? 0) * 100)}%)`;
};

export const colorFormatter = (
  colorValue: string,
  format: ColorFormat = "hsl",
  tailwindVersion: "3" | "4" = "3",
): string => {
  try {
    const color = culori.parse(colorValue);
    if (!color) throw new Error("Invalid color input");

    switch (format) {
      case "hsl": {
        const hsl = culori.converter("hsl")(color);
        if (tailwindVersion === "4") {
          return formatHsl(hsl);
        }
        return `${formatNumber(hsl.h)} ${formatNumber((hsl.s ?? 0) * 100)}% ${formatNumber((hsl.l ?? 0) * 100)}%`;
      }
      case "rgb":
        return culori.formatRgb(color);
      case "oklch": {
        const oklch = culori.converter("oklch")(color);
        return `oklch(${formatNumber(oklch.l)} ${formatNumber(oklch.c)} ${formatNumber(oklch.h)})`;
      }
      case "hex":
        return culori.formatHex(color);
      default:
        return colorValue;
    }
  } catch {
    console.error(`Failed to convert color: ${colorValue}`);
    return colorValue;
  }
};

export const convertToHSL = (colorValue: string): string =>
  colorFormatter(colorValue, "hsl");
