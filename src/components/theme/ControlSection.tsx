import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface ControlSectionProps {
  title: string;
  children: React.ReactNode;
  expanded?: boolean;
}

/** A collapsible section for grouping theme controls. */
function ControlSection({
  title,
  children,
  expanded = false,
}: ControlSectionProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border">
      <div
        className="flex cursor-pointer items-center justify-between bg-background p-3 hover:bg-muted"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          type="button"
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label={isExpanded ? "Collapse section" : "Expand section"}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-500 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="border-t border-border bg-background p-3">
          {children}
        </div>
      </div>
    </div>
  );
}

export { ControlSection };
