import { useTimeGridSelection } from "@/hooks/useCalendarTimeGridSelection";
import {
  formatDate,
  formatTime,
  getEventTimePosition,
  getWeekDays,
  isToday,
  partitionEventsByAllDay,
} from "@/lib/calendar/calendar-utils";
import { computeOverlapLayout } from "@/lib/calendar/overlap-utils";
import { CalendarEvent, EventsByDate } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CurrentTimeIndicator } from "./CurrentTimeIndicator";
import { EventCard } from "./EventCard";

interface WeekViewProps {
  year: number;
  month: number;
  day: number;
  eventsByDate: EventsByDate;
  use24Hour: boolean;
  onDateClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
  onTimeSelect: (date: string, time: string) => void;
  highlightedEventId?: string;
  highlightToken?: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 80;

export function WeekView({
  year,
  month,
  day,
  eventsByDate,
  use24Hour,
  onDateClick,
  onEventClick,
  onTimeSelect,
  highlightedEventId,
  highlightToken,
}: WeekViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long" }),
    [locale],
  );
  const currentDate = useMemo(
    () => new Date(year, month, day),
    [day, month, year],
  );
  const weekDays = useMemo(
    () => getWeekDays(new Date(year, month, day)),
    [year, month, day],
  );
  const weekDayData = useMemo(() => {
    return weekDays.map((weekDay) => {
      const dateStr = formatDate(weekDay);
      const dayEvents = eventsByDate[dateStr] || [];
      const { allDayEvents, timedEvents } = partitionEventsByAllDay(dayEvents);

      return {
        dateStr,
        weekDay,
        dayEvents,
        allDayEvents,
        timedEvents,
        overlapLayout: computeOverlapLayout(timedEvents),
        isTodayDate: isToday(weekDay),
      };
    });
  }, [eventsByDate, weekDays]);
  const hasAnyAllDayEvents = weekDayData.some(
    (entry) => entry.allDayEvents.length > 0,
  );
  const handleSelectedTime = useCallback(
    (time: string) => {
      const selectedDate =
        weekDays.find((weekDay) => isToday(weekDay)) ?? currentDate;
      onTimeSelect(formatDate(selectedDate), time);
    },
    [currentDate, onTimeSelect, weekDays],
  );

  const {
    gridRef,
    manualTimeOffset,
    selectedTime,
    showManualTimeIndicator,
    handleGridPointerMove,
    handleGridPointerLeave,
    handleManualPointerDown,
    handleManualPointerMove,
    handleManualPointerUp,
    handleManualPointerCancel,
  } = useTimeGridSelection({
    hourHeight: HOUR_HEIGHT,
    railWidth: 80,
    onTimeSelect: handleSelectedTime,
  });

  const selectedTimeLabel = formatTime(selectedTime, use24Hour);
  const hasTodayInWeek = weekDayData.some((entry) => entry.isTodayDate);

  return (
    <div className="h-full border border-border rounded-lg overflow-hidden flex flex-col">
      <div className="hover-scrollbar flex-1 overflow-auto">
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border bg-card shrink-0 sticky top-0 z-20">
          <div className="border-r border-border p-3" />
          {weekDayData.map(
            ({ dateStr, weekDay, isTodayDate, dayEvents }, index) => {
              return (
                <div
                  key={index}
                  className={cn(
                    "border-r border-border p-3 text-center",
                    isTodayDate && "bg-primary/5",
                  )}
                >
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    {weekdayFormatter.format(weekDay)}
                  </div>
                  <button
                    onClick={() => onDateClick(dateStr)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold transition-colors mx-auto hover:cursor-pointer",
                      isTodayDate && "bg-primary text-primary-foreground",
                      !isTodayDate && "hover:bg-accent/5",
                    )}
                  >
                    {weekDay.getDate()}
                  </button>
                  {dayEvents.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t("event-calendar.calendar.eventCount", {
                        count: dayEvents.length,
                      })}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>

        {hasAnyAllDayEvents && (
          <div className="border-b border-border bg-card">
            <div className="grid grid-cols-[80px_repeat(7,1fr)]">
              <div className="border-r border-border p-3 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("event-calendar.calendar.allDay")}
                </span>
              </div>
              {weekDayData.map(({ allDayEvents }, dayIndex) => {
                return (
                  <div
                    key={dayIndex}
                    className="border-r border-border p-2 min-h-15"
                  >
                    <div className="space-y-1">
                      {allDayEvents.map((event) => {
                        const isHighlighted = event.id === highlightedEventId;

                        return (
                          <div key={event.id}>
                            <EventCard
                              event={event}
                              use24Hour={use24Hour}
                              onClick={onEventClick}
                              showDescription
                              highlighted={isHighlighted}
                              highlightToken={
                                isHighlighted ? highlightToken : undefined
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          ref={gridRef}
          className="relative flex"
          onPointerMove={handleGridPointerMove}
          onPointerLeave={handleGridPointerLeave}
        >
          <div className="w-20 shrink-0 bg-muted/30 border-r border-border">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="p-2 text-right border-b border-border"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                <span className="text-xs font-medium text-muted-foreground font-mono">
                  {formatTime(
                    `${hour.toString().padStart(2, "0")}:00`,
                    use24Hour,
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7">
            {weekDayData.map(
              ({ timedEvents, overlapLayout, isTodayDate }, dayIndex) => {
                return (
                  <div
                    key={dayIndex}
                    className="relative border-r border-border"
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className={cn(
                          "border-b border-border hover:bg-accent/5 transition-colors",
                          isTodayDate && "bg-primary/5",
                        )}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {timedEvents.map((event) => {
                      const { top, height } = getEventTimePosition(
                        event,
                        HOUR_HEIGHT,
                      );
                      const layout = overlapLayout.get(event.id);
                      const columnIndex = layout?.columnIndex ?? 0;
                      const totalColumns = layout?.totalColumns ?? 1;
                      const leftPercent = (columnIndex / totalColumns) * 100;
                      const widthPercent = (1 / totalColumns) * 100;

                      const isHighlighted = event.id === highlightedEventId;

                      return (
                        <div
                          key={event.id}
                          className="absolute z-10 px-px"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `calc(${leftPercent}% + 1px)`,
                            width: `calc(${widthPercent}% - 2px)`,
                          }}
                        >
                          <EventCard
                            event={event}
                            use24Hour={use24Hour}
                            onClick={onEventClick}
                            className="h-full"
                            showDescription
                            highlighted={isHighlighted}
                            highlightToken={
                              isHighlighted ? highlightToken : undefined
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              },
            )}
          </div>

          <CurrentTimeIndicator
            enabled={hasTodayInWeek}
            hourHeight={HOUR_HEIGHT}
            use24Hour={use24Hour}
            totalHours={HOURS.length}
          />

          {showManualTimeIndicator && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20"
              style={{ top: `${manualTimeOffset}px` }}
              aria-label={t("event-calendar.calendar.selectedTime", {
                time: selectedTimeLabel,
              })}
            >
              <div className="relative h-0">
                <button
                  type="button"
                  className="pointer-events-auto absolute left-1 -translate-y-1/2 rounded bg-foreground px-1.5 py-0.5 text-[11px] font-semibold leading-none text-background shadow-sm cursor-pointer"
                  aria-label={t("event-calendar.calendar.createEventAt", {
                    time: selectedTimeLabel,
                  })}
                  onPointerDown={handleManualPointerDown}
                  onPointerMove={handleManualPointerMove}
                  onPointerUp={handleManualPointerUp}
                  onPointerCancel={handleManualPointerCancel}
                >
                  {selectedTimeLabel}
                </button>
                <div className="h-px w-full bg-foreground/70" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
