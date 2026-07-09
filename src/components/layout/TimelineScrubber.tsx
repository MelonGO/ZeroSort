import { cn } from "@/lib/utils";
import { ScrubberMonth } from "@/types/timeline";
import React, { useMemo, useRef, useState } from "react";

interface ScrubberSegment extends ScrubberMonth {
  pos: number;
  sizePercent: number;
}

/**
 * Finds the scrubber segment that contains a percentage offset via binary search.
 */
function findScrubberSegment(
  segments: ScrubberSegment[],
  percentage: number,
): ScrubberSegment | null {
  if (segments.length === 0) {
    return null;
  }

  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const segment = segments[mid];

    if (percentage < segment.pos) {
      high = mid - 1;
      continue;
    }

    if (percentage > segment.pos + segment.sizePercent) {
      low = mid + 1;
      continue;
    }

    return segment;
  }

  return segments[Math.min(low, segments.length - 1)] ?? null;
}

/**
 * Properties for the {@link TimelineScrubber} component.
 */
interface TimelineScrubberProps {
  /** Array of month data to display in the scrubber. */
  months: ScrubberMonth[];
  /** Callback triggered when a month segment is clicked. */
  onMonthClick: (year: number, month: number) => void;
  /** The ID of the currently active month in the viewport. */
  activeMonthId?: string | null;
  /** Optional CSS class name for the container. */
  className?: string;
}

/**
 * A timeline scrubber component that allows quick navigation through notes by month.
 * Displays segments representing months, with size proportional to the number of notes or group height.
 *
 * Typically used as a sidebar.
 */
export const TimelineScrubber = React.memo<TimelineScrubberProps>(
  ({ months, onMonthClick, activeMonthId, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const segments = useMemo(() => {
      // Calculate the total 'weight' of the timeline. Using height ensures the scrubber
      // visual proportions match the actual scrollable area.
      const total = months.reduce((acc, m) => acc + (m.height || m.count), 0);

      let currentPos = 0;
      return months.map((month) => {
        const value = month.height || month.count;
        const sizePercent = total > 0 ? (value / total) * 100 : 0;
        const pos = currentPos;
        currentPos += sizePercent;

        return {
          ...month,
          pos,
          sizePercent,
        };
      });
    }, [months]);

    const [scrubMonth, setScrubMonth] = useState<ScrubberSegment | null>(null);

    // Handle interaction on the entire track to allow "scrubbing" behavior.
    const handleInteraction = (
      e: React.MouseEvent | React.TouchEvent | React.PointerEvent,
    ) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      let clientPos: number;
      let size: number;
      let offset: number;

      const isTouch = "touches" in e && e.touches.length > 0;
      if (isTouch) {
        clientPos = e.touches[0].clientY;
      } else {
        clientPos = (e as React.MouseEvent).clientY;
      }

      // Subtract vertical padding (py-10) to align the interactive area with the visual track.
      size = rect.height - 80;
      offset = clientPos - (rect.top + 40);

      // Convert pixel offset to a percentage of the total track length.
      const percentage = Math.max(0, Math.min(100, (offset / size) * 100));

      // Find the month corresponding to this percentage
      const segment = findScrubberSegment(segments, percentage);

      if (segment) {
        setScrubMonth(segment);
        onMonthClick(segment.year, segment.month);
      }
    };

    return (
      <div
        ref={containerRef}
        className={cn(
          "group relative z-20 shrink-0 touch-none select-none bg-background",
          "h-full w-10 py-10",
          className,
        )}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          handleInteraction(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && handleInteraction(e)}
        onPointerUp={() => setScrubMonth(null)}
        onPointerLeave={() => setScrubMonth(null)}
      >
        {/* Track Line */}
        <div
          className={cn(
            "absolute rounded-full bg-muted/20 transition-colors group-hover:bg-muted/40 dark:bg-muted/10 dark:group-hover:bg-muted/20",
            "top-10 right-4 bottom-10 w-0.5",
          )}
        />

        {/* Markers & Labels */}
        <div className="relative h-full w-full">
          {segments.map((segment) => {
            const isYear = segment.month === 1;
            const isActive =
              activeMonthId === `${segment.year}-${segment.month}`;
            const isVisible = isYear || isActive;

            return (
              <div
                key={`${segment.year}-${segment.month}`}
                className="pointer-events-none absolute transition-all duration-300"
                style={{
                  top: `${segment.pos + segment.sizePercent / 2}%`,
                  right: "0",
                  width: "100%",
                }}
              >
                {/* Tick */}
                <div
                  className={cn(
                    "absolute rounded-full transition-all",
                    "top-1/2 right-4 -translate-y-1/2",
                    isActive
                      ? "z-10 bg-primary"
                      : isYear
                        ? "bg-muted-foreground/60"
                        : "bg-muted/30 opacity-20 dark:bg-muted/10",
                    isActive ? "h-1 w-3" : "h-0.5 w-1.5",
                  )}
                />

                {/* Label */}
                {isVisible && (
                  <span
                    className={cn(
                      "absolute text-[0.65rem] font-bold whitespace-nowrap transition-colors",
                      "top-1/2 right-10 -translate-y-1/2 text-right",
                      isActive ? "text-primary" : "text-muted-foreground/40",
                    )}
                  >
                    {isYear ? segment.year : segment.title.substring(0, 3)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Scrub Indicator Bubble */}
        {scrubMonth && (
          <div
            className={cn(
              "pointer-events-none absolute z-50 animate-in rounded-lg bg-primary px-3 py-1.5 text-xs font-bold whitespace-nowrap text-primary-foreground shadow-xl duration-200 fade-in zoom-in",
              "right-12",
            )}
            style={{
              top: `${scrubMonth.pos + scrubMonth.sizePercent / 2}%`,
              transform: "translateY(-50%)",
            }}
          >
            {scrubMonth.year} {scrubMonth.title}
            <div
              className={cn(
                "absolute border-4 border-transparent",
                "top-1/2 -right-2 -translate-y-1/2 border-l-primary",
              )}
            />
          </div>
        )}
      </div>
    );
  },
);
