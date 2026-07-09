import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import {
  formatDate,
  getMonthDays,
  isToday,
} from "@/lib/calendar/calendar-utils";
import { CalendarEvent, EventsByDate } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EventCard } from "./EventCard";

interface MonthViewProps {
  year: number;
  month: number;
  eventsByDate: EventsByDate;
  use24Hour: boolean;
  onDateClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  highlightedEventId?: string;
  highlightToken?: number;
}

export function MonthView({
  year,
  month,
  eventsByDate,
  use24Hour,
  onDateClick,
  onEventClick,
  highlightedEventId,
  highlightToken,
}: MonthViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const days = useMemo(() => getMonthDays(year, month), [year, month]);
  const weekdayLabels = useMemo(() => {
    const baseDate = new Date(2024, 0, 7);
    const longFormatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const compactFormatter = new Intl.DateTimeFormat(locale, {
      weekday: "narrow",
    });

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + index);

      return {
        long: longFormatter.format(date),
        compact: compactFormatter.format(date),
      };
    });
  }, [locale]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const isMobile = !useIsLargeScreen();
  const isCompactMonth = !useIsLargeScreen(520);
  const visibleEventCount = 1;

  return (
    <div className="flex flex-col h-full">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {weekdayLabels.map((day) => (
          <div
            key={day.long}
            className="py-2 text-center text-[11px] font-semibold text-muted-foreground sm:text-sm"
          >
            {isMobile ? day.compact : day.long}
          </div>
        ))}
      </div>

      <div className="hover-scrollbar grid grid-cols-7 gap-1 flex-1 overflow-y-auto">
        {days.map((day, index) => {
          if (!day) {
            return (
              <div
                key={`padding-${index}`}
                className="min-h-23 sm:min-h-31 lg:min-h-33"
              />
            );
          }

          const dateStr = formatDate(day);
          const dayEvents = eventsByDate[dateStr] || [];
          const visibleEvents = dayEvents.slice(0, visibleEventCount);
          const remainingCount = dayEvents.length - visibleEventCount;
          const shouldShowCreateButton = remainingCount <= 0;
          const isTodayDate = isToday(day);

          return (
            <div
              key={index}
              className={cn(
                "group/month-day flex min-h-23 flex-col gap-1 rounded-lg border border-border p-1.5 sm:min-h-31 sm:p-2 lg:min-h-33",
                "hover:bg-accent/5 transition-colors",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <button
                  onClick={() => onDateClick(dateStr)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:h-8 sm:w-8 sm:text-xs hover:cursor-pointer",
                    isTodayDate && "bg-primary text-primary-foreground",
                    !isTodayDate && "hover:bg-accent/5",
                  )}
                >
                  {day.getDate()}
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                {visibleEvents.map((event) => {
                  const isHighlighted = event.id === highlightedEventId;

                  return (
                    <EventCard
                      key={`${event.id}-${dateStr}`}
                      event={event}
                      use24Hour={use24Hour}
                      compact={isCompactMonth}
                      variant="month"
                      onClick={onEventClick}
                      showDescription
                      highlighted={isHighlighted}
                      highlightToken={
                        isHighlighted ? highlightToken : undefined
                      }
                    />
                  );
                })}

                {shouldShowCreateButton && (
                  <button
                    type="button"
                    onClick={() => onDateClick(dateStr)}
                    aria-label={t("event-calendar.calendar.createEventOn", {
                      date: day.toLocaleDateString(locale, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      }),
                    })}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-md border border-dashed border-border/70 font-medium text-muted-foreground transition-all",
                      isCompactMonth
                        ? "mt-auto min-h-7 border-transparent bg-transparent px-0 py-1 text-[10px]"
                        : "max-h-0 min-h-0 overflow-hidden border-transparent px-0 py-0 text-xs opacity-0 pointer-events-none group-hover/month-day:max-h-10 group-hover/month-day:min-h-10 group-hover/month-day:border-border/70 group-hover/month-day:px-2 group-hover/month-day:py-1 group-hover/month-day:opacity-100 group-hover/month-day:pointer-events-auto focus-visible:max-h-10 focus-visible:min-h-10 focus-visible:border-border/70 focus-visible:px-2 focus-visible:py-1",
                      "hover:border-primary/50 hover:bg-background/80 hover:text-foreground hover:cursor-pointer",
                      "focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    <Plus className="size-3" strokeWidth={2.5} />
                    <span>
                      {isCompactMonth
                        ? t("event-calendar.actions.add")
                        : t("event-calendar.actions.createEvent")}
                    </span>
                  </button>
                )}

                {remainingCount > 0 && (
                  <Popover
                    open={selectedDate === dateStr}
                    onOpenChange={(open) =>
                      setSelectedDate(open ? dateStr : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <button
                        className="mt-auto w-full rounded px-1 py-1 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground sm:px-2 sm:text-xs"
                        onClick={() => setSelectedDate(dateStr)}
                      >
                        {t("event-calendar.calendar.moreEvents", {
                          count: remainingCount,
                        })}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(18rem,calc(100vw-2rem))] sm:w-80">
                      <div className="space-y-2">
                        <div className="font-semibold text-sm mb-2">
                          {day.toLocaleDateString(locale, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                        {dayEvents.map((event) => {
                          const isHighlighted = event.id === highlightedEventId;

                          return (
                            <EventCard
                              key={`${event.id}-popup`}
                              event={event}
                              use24Hour={use24Hour}
                              onClick={onEventClick}
                              showDescription
                              highlighted={isHighlighted}
                              highlightToken={
                                isHighlighted ? highlightToken : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
