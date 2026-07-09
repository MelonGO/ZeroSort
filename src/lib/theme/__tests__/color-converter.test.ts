/**
 * Tests for theme color conversion helpers used by the theme editor.
 */
import {
  colorFormatter,
  convertToHSL,
  formatHsl,
  formatNumber,
} from "@/lib/theme/color-converter";
import { describe, expect, it, vi } from "vitest";

describe("color-converter", () => {
  describe("formatNumber", () => {
    it("Should return zero for missing and zero values", () => {
      expect(formatNumber()).toBe("0");
      expect(formatNumber(0)).toBe("0");
    });

    it("Should preserve integers and round decimals to four places", () => {
      expect(formatNumber(12)).toBe(12);
      expect(formatNumber(0.123456)).toBe("0.1235");
    });
  });

  describe("formatHsl", () => {
    it("Should format HSL channel values using percentages", () => {
      expect(formatHsl({ h: 210, s: 0.5, l: 0.25 })).toBe("hsl(210 50% 25%)");
    });
  });

  describe("colorFormatter", () => {
    it("Should format HSL output for Tailwind v3 tokens", () => {
      expect(colorFormatter("#ff0000", "hsl", "3")).toBe("0 100% 50%");
    });

    it("Should format HSL output for Tailwind v4 tokens", () => {
      expect(colorFormatter("#ff0000", "hsl", "4")).toBe("hsl(0 100% 50%)");
    });

    it("Should format RGB, OKLCH, and hex output", () => {
      expect(colorFormatter("#ff0000", "rgb")).toBe("rgb(255, 0, 0)");
      expect(colorFormatter("#ff0000", "oklch")).toBe(
        "oklch(0.6280 0.2577 29.2339)",
      );
      expect(colorFormatter("#ff0000", "hex")).toBe("#ff0000");
    });

    it("Should return the original value and log when parsing fails", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      expect(colorFormatter("not-a-color", "hsl")).toBe("not-a-color");
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to convert color: not-a-color",
      );
    });
  });

  describe("convertToHSL", () => {
    it("Should proxy to the HSL formatter", () => {
      expect(convertToHSL("rgb(0, 255, 0)")).toBe("120 100% 50%");
    });
  });
});
