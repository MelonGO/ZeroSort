import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ColorSwatch {
  /** Display name for the color */
  name: string;
  /** Hex color value */
  value: string;
}

/** Pastel background colors for text highlighting */
export const HIGHLIGHT_COLORS: ColorSwatch[] = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Purple", value: "#e9d5ff" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Red", value: "#fecaca" },
  { name: "Cyan", value: "#a5f3fc" },
  { name: "Lime", value: "#d9f99d" },
  { name: "Gray", value: "#e5e7eb" },
  { name: "Amber", value: "#fde68a" },
  { name: "Rose", value: "#fda4af" },
];

/** Saturated foreground colors for text coloring */
export const TEXT_COLORS: ColorSwatch[] = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Gray", value: "#6b7280" },
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#000000" },
];

interface ColorPickerProps {
  /** Array of preset color swatches to display */
  colors: ColorSwatch[];
  /** Currently active color value (hex string or undefined) */
  activeColor?: string;
  /** Callback when a color is selected */
  onSelectColor: (color: string) => void;
  /** Callback to remove/unset the current color */
  onRemoveColor: () => void;
  /** Callback to close the picker */
  onClose: () => void;
}

/** Validates a hex color string (3 or 6 digit, with or without #) */
function isValidHex(value: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** Normalizes a hex input to a full #rrggbb format */
function normalizeHex(value: string): string {
  let hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${hex.toLowerCase()}`;
}

/**
 * Reusable color picker dropdown with preset swatches and custom hex input.
 * Used by both Highlight and Text Color toolbar buttons.
 */
export function ColorPicker({
  colors,
  activeColor,
  onSelectColor,
  onRemoveColor,
  onClose,
}: ColorPickerProps) {
  const { t } = useTranslation();
  const [customHex, setCustomHex] = useState("");
  const [hexError, setHexError] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCustomSubmit = useCallback(() => {
    if (!customHex.trim()) return;

    if (isValidHex(customHex)) {
      onSelectColor(normalizeHex(customHex));
      setCustomHex("");
      setHexError(false);
    } else {
      setHexError(true);
    }
  }, [customHex, onSelectColor]);

  const normalizedActive = activeColor?.toLowerCase();

  return (
    <div
      ref={pickerRef}
      className="absolute top-full left-0 z-50 mt-1 flex w-56 flex-col gap-2 rounded-xl border border-border bg-popover p-3 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Preset swatches grid */}
      <div className="grid grid-cols-6 gap-1.5">
        {colors.map((swatch) => {
          const isActive = normalizedActive === swatch.value.toLowerCase();
          return (
            <button
              key={swatch.value}
              type="button"
              title={swatch.name}
              onClick={() => onSelectColor(swatch.value)}
              className={cn(
                "relative flex h-7 w-7 items-center justify-center rounded-md border transition-all hover:scale-110",
                isActive
                  ? "border-foreground ring-1 ring-foreground"
                  : "border-border hover:border-foreground/50",
              )}
              style={{ backgroundColor: swatch.value }}
            >
              {isActive && (
                <Check
                  size={14}
                  className={cn(
                    "drop-shadow-sm",
                    // Use dark check on light backgrounds, white check on dark backgrounds
                    swatch.value === "#000000" || swatch.value === "#6b7280"
                      ? "text-white"
                      : "text-gray-800",
                  )}
                  strokeWidth={3}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Custom hex input */}
      <div className="flex items-center gap-1.5">
        <div
          className="h-7 w-7 shrink-0 rounded-md border border-border"
          style={{
            backgroundColor:
              customHex && isValidHex(customHex)
                ? normalizeHex(customHex)
                : "transparent",
          }}
        />
        <input
          type="text"
          placeholder="#ff5733"
          value={customHex}
          onChange={(e) => {
            setCustomHex(e.target.value);
            setHexError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCustomSubmit();
            }
          }}
          className={cn(
            "h-7 w-full min-w-0 rounded-md border bg-muted px-2 font-mono text-xs outline-none transition-colors focus:ring-1 focus:ring-accent",
            hexError ? "border-destructive" : "border-border",
          )}
        />
        <button
          type="button"
          onClick={handleCustomSubmit}
          disabled={!customHex.trim()}
          className="h-7 shrink-0 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {t("editor.applyColor")}
        </button>
      </div>

      {/* Remove color button */}
      <button
        type="button"
        onClick={onRemoveColor}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={12} />
        {t("editor.removeColor")}
      </button>
    </div>
  );
}
