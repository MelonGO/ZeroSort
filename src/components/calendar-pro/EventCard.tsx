import { formatTime } from "@/lib/calendar/calendar-utils";
import { EVENT_CARD_COLOR_CLASSES } from "@/lib/calendar/event-colors";
import { CalendarEvent } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

interface EventCardProps {
  event: CalendarEvent;
  use24Hour: boolean;
  onClick?: (event: CalendarEvent) => void;
  className?: string;
  compact?: boolean;
  variant?: "default" | "month";
  showDescription?: boolean;
  highlighted?: boolean;
  highlightToken?: number;
}

function formatMonthTimeRange(
  startTime: string,
  endTime: string,
  use24Hour: boolean,
) {
  const start = formatTime(startTime, use24Hour);
  const end = formatTime(endTime, use24Hour);

  if (use24Hour) {
    return `${start}-${end}`;
  }

  const [startClock, startMeridiem] = start.split(" ");
  const [endClock, endMeridiem] = end.split(" ");

  if (startMeridiem && endMeridiem && startMeridiem === endMeridiem) {
    return `${startClock}-${endClock} ${endMeridiem}`;
  }

  return `${start}-${end}`;
}

function EventCardComponent({
  event,
  use24Hour,
  onClick,
  className,
  compact = false,
  variant = "default",
  showDescription = false,
  highlighted = false,
  highlightToken,
}: EventCardProps) {
  const { t } = useTranslation();
  const isMonthVariant = variant === "month";
  const cardRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLDivElement | null>(null);
  const [showTime, setShowTime] = useState(false);
  const timeDisplay = useMemo(() => {
    if (event.isAllDay) {
      return isMonthVariant
        ? t("event-calendar.calendar.allDayCompact")
        : t("event-calendar.calendar.allDay");
    }

    if (isMonthVariant) {
      return formatMonthTimeRange(event.startTime, event.endTime, use24Hour);
    }

    return `${formatTime(event.startTime, use24Hour)} - ${formatTime(event.endTime, use24Hour)}`;
  }, [
    event.endTime,
    event.isAllDay,
    event.startTime,
    isMonthVariant,
    t,
    use24Hour,
  ]);

  const handleClick = useCallback(() => {
    onClick?.(event);
  }, [event, onClick]);

  useLayoutEffect(() => {
    if (compact) {
      setShowTime(false);
      return;
    }

    const measureTimeVisibility = () => {
      const timeElement = timeRef.current;

      if (!timeElement) {
        return;
      }

      setShowTime(timeElement.scrollWidth <= timeElement.clientWidth);
    };

    measureTimeVisibility();

    const resizeObserver = new ResizeObserver(() => {
      measureTimeVisibility();
    });

    if (cardRef.current) {
      resizeObserver.observe(cardRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [compact, timeDisplay]);

  return (
    <div
      ref={cardRef}
      data-event-card-id={event.id}
      className={cn(
        "w-full shrink-0 overflow-hidden border font-medium transition-opacity hover:opacity-60",
        onClick && "cursor-pointer",
        highlighted &&
          "animate-event-change ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
        isMonthVariant
          ? compact
            ? "rounded px-1.5 py-1 text-[11px]"
            : "rounded px-2 py-1.5 text-xs"
          : compact
            ? "rounded px-1.5 py-1 text-[11px]"
            : "rounded px-2 py-1 text-xs",
        !compact && "cursor-pointer",
        EVENT_CARD_COLOR_CLASSES[event.color],
        className,
      )}
      data-highlight-token={highlighted ? highlightToken : undefined}
      onClick={handleClick}
    >
      <div
        className={cn(
          "truncate font-semibold leading-tight",
          isMonthVariant && "text-[13px]",
        )}
      >
        {event.title}
      </div>
      {showDescription && event.description && !compact && (
        <div className="mt-1 line-clamp-2 text-[11px] leading-snug opacity-90">
          {event.description}
        </div>
      )}
      {!compact && (
        <div
          ref={timeRef}
          className={cn(
            "overflow-hidden whitespace-nowrap",
            showDescription && event.description && "mt-1",
            isMonthVariant
              ? "pt-0.5 text-[10px] font-semibold tracking-tight opacity-80"
              : "font-mono text-[10px] opacity-90",
            !showTime && "max-h-0 pt-0 opacity-0",
          )}
        >
          {timeDisplay}
        </div>
      )}
    </div>
  );
}

function areEqual(prevProps: EventCardProps, nextProps: EventCardProps) {
  return (
    prevProps.use24Hour === nextProps.use24Hour &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.className === nextProps.className &&
    prevProps.compact === nextProps.compact &&
    prevProps.variant === nextProps.variant &&
    prevProps.showDescription === nextProps.showDescription &&
    prevProps.highlighted === nextProps.highlighted &&
    prevProps.highlightToken === nextProps.highlightToken &&
    prevProps.event.id === nextProps.event.id &&
    prevProps.event.title === nextProps.event.title &&
    prevProps.event.description === nextProps.event.description &&
    prevProps.event.startDate === nextProps.event.startDate &&
    prevProps.event.endDate === nextProps.event.endDate &&
    prevProps.event.startTime === nextProps.event.startTime &&
    prevProps.event.endTime === nextProps.event.endTime &&
    prevProps.event.color === nextProps.event.color &&
    prevProps.event.isAllDay === nextProps.event.isAllDay
  );
}

export const EventCard = memo(EventCardComponent, areEqual);
