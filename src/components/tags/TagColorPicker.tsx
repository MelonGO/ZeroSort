import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
];

interface TagColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
}

/** Compact color swatch picker for tag colors. */
export function TagColorPicker({ value, onChange }: TagColorPickerProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "flex size-5 items-center justify-center rounded-full border transition-colors",
          value === null
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/20 hover:border-muted-foreground/40",
        )}
        title="No color"
      >
        <X size={10} className="text-muted-foreground" />
      </button>
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "size-5 rounded-full border-2 transition-all",
            value === color
              ? "scale-110 border-foreground/60"
              : "border-transparent hover:scale-110",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
