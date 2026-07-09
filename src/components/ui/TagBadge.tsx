import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface TagBadgeProps {
  name: string;
  color?: string | null;
  onRemove?: () => void;
  onClick?: () => void;
  selected?: boolean;
  size?: "sm" | "md";
}

/** Small pill/badge displaying a tag name with optional color dot and remove button. */
export function TagBadge({
  name,
  color,
  onRemove,
  onClick,
  selected,
  size = "sm",
}: TagBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border transition-colors",
        size === "sm"
          ? "px-2 py-0.5 text-xs"
          : "px-2.5 py-1 text-xs font-medium",
        selected
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-muted bg-muted/50 text-muted-foreground",
        onClick && "cursor-pointer hover:bg-muted",
      )}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {color && (
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}
