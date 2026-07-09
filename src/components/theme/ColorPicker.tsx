import { Label } from "@/components/ui/label";
import * as culori from "culori";
import { useCallback, useEffect, useRef, useState } from "react";
import { SketchPicker, type ColorResult } from "react-color";
import { createPortal } from "react-dom";

/** Convert any valid CSS color string to hex. Returns original on failure. */
function toHex(color: string): string {
  try {
    const parsed = culori.parse(color);
    if (parsed) return culori.formatHex(parsed);
  } catch {}
  return color;
}

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
}

interface PickerPosition {
  top: number;
  left: number;
}

/** A color picker using SketchPicker in a popover. */
function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [localColor, setLocalColor] = useState(() => toHex(color));
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<PickerPosition>({ top: 0, left: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setLocalColor(toHex(color));
  }, [color]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const pickerWidth = 220;
    const pickerHeight = 315;
    const viewportPadding = 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= pickerHeight + viewportPadding
        ? rect.bottom + 8
        : Math.max(viewportPadding, rect.top - pickerHeight - 8);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - pickerWidth - viewportPadding,
    );

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleViewportChange = () => updatePosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePosition]);

  const handleChange = useCallback(
    (result: ColorResult) => {
      setLocalColor(result.hex);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(result.hex);
      }, 100);
    },
    [onChange],
  );

  const handleChangeComplete = useCallback(
    (result: ColorResult) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLocalColor(result.hex);
      onChange(result.hex);
    },
    [onChange],
  );

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
      </div>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-8 w-full items-center gap-2 rounded border border-border px-2"
        >
          <span
            className="block h-5 w-5 shrink-0 rounded border border-border"
            style={{ backgroundColor: localColor }}
          />
          <span className="text-xs text-muted-foreground">{localColor}</span>
        </button>
        {isOpen &&
          createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />
              <div
                className="fixed z-50"
                style={{ left: position.left, top: position.top }}
              >
                <SketchPicker
                  color={localColor}
                  onChange={handleChange}
                  onChangeComplete={handleChangeComplete}
                  disableAlpha
                />
              </div>
            </>,
            document.body,
          )}
      </div>
    </div>
  );
}

export { ColorPicker };
