import { Separator } from "@/components/ui/separator";
import {
  getDateRangeForView,
  isDateInRange,
  isEventInDateRange,
  organizeEventsByDate,
} from "@/lib/calendar/calendar-utils";
import { CalendarEvent, CalendarView } from "@/lib/calendar/types";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EventCard } from "./EventCard";

interface ListViewProps {
  filteredEvents: CalendarEvent[];
  use24Hour: boolean;
  onEventClick: (event: CalendarEvent) => void;
  view: CalendarView;
  year: number;
  month: number;
  day: number;
  highlightedEventId?: string;
  highlightToken?: number;
}

export function ListView({
  filteredEvents,
  use24Hour,
  onEventClick,
  view,
  year,
  month,
  day,
  highlightedEventId,
  highlightToken,
}: ListViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const { start, end } = useMemo(
    () => getDateRangeForView(view, year, month, day),
    [view, year, month, day],
  );
  const { currentEventsByDate, sortedDates } = useMemo(() => {
    const currentRangeEvents = filteredEvents.filter((event) =>
      isEventInDateRange(event, start, end),
    );
    const eventsByDate = organizeEventsByDate(currentRangeEvents);
    const entries = Object.entries(eventsByDate).filter(([dateStr]) =>
      isDateInRange(dateStr, start, end),
    );

    return {
      currentEventsByDate: Object.fromEntries(entries),
      sortedDates: entries.map(([dateStr]) => dateStr).sort(),
    };
  }, [filteredEvents, start, end]);

  if (sortedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">
            {t("event-calendar.list.noEvents")}
          </p>
          <p className="text-sm">{t("event-calendar.list.emptyHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hover-scrollbar space-y-4 overflow-auto h-full pb-4">
      {sortedDates.map((dateStr, index) => {
        const date = new Date(dateStr + "T00:00:00");
        const dayEvents = currentEventsByDate[dateStr];

        return (
          <div key={dateStr}>
            {index > 0 && <Separator className="my-4" />}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground">
                {date.toLocaleDateString(locale, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>
              <div className="space-y-2">
                {dayEvents.map((event) => {
                  const isHighlighted = event.id === highlightedEventId;

                  return (
                    <EventCard
                      key={`${event.id}-${dateStr}`}
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
