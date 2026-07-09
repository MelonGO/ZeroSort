import { useTimeGridSelection } from "@/hooks/useCalendarTimeGridSelection";
import {
  formatDate,
  formatTime,
  getEventTimePosition,
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

interface DayViewProps {
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
const HOUR_HEIGHT = 100;

export function DayView({
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
}: DayViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const currentDate = useMemo(
    () => new Date(year, month, day),
    [day, month, year],
  );
  const dateStr = useMemo(() => formatDate(currentDate), [currentDate]);
  const isTodayDate = isToday(currentDate);

  const dayEvents = useMemo(
    () => eventsByDate[dateStr] ?? [],
    [eventsByDate, dateStr],
  );
  const { allDayEvents, timedEvents } = useMemo(
    () => partitionEventsByAllDay(dayEvents),
    [dayEvents],
  );
  const overlapLayout = useMemo(
    () => computeOverlapLayout(timedEvents),
    [timedEvents],
  );
  const handleSelectedTime = useCallback(
    (time: string) => {
      onTimeSelect(dateStr, time);
    },
    [dateStr, onTimeSelect],
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
    railWidth: 112,
    onTimeSelect: handleSelectedTime,
  });

  const selectedTimeLabel = formatTime(selectedTime, use24Hour);

  return (
    <div className="h-full border border-border rounded-lg overflow-hidden flex flex-col">
      <div className="hover-scrollbar flex-1 overflow-auto">
        <div className="border-b border-border bg-card p-6 shrink-0 sticky top-0 z-20">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">
                  {currentDate.toLocaleDateString(locale, { weekday: "long" })}
                </div>
                <button
                  onClick={() => onDateClick(dateStr)}
                  className="flex items-baseline gap-3 group"
                >
                  <span
                    className={cn(
                      "text-4xl font-bold transition-colors hover:cursor-pointer",
                      isTodayDate && "text-primary",
                      "hover:bg-accent/5 rounded-full p-2",
                    )}
                  >
                    {currentDate.getDate()}
                  </span>
                  <div className="text-left">
                    <div className="text-xl font-semibold">
                      {currentDate.toLocaleDateString(locale, {
                        month: "long",
                      })}
                    </div>
                    <div className="text-left text-sm text-muted-foreground">
                      {currentDate.getFullYear()}
                    </div>
                  </div>
                </button>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">
                  {dayEvents.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("event-calendar.calendar.eventCount", {
                    count: dayEvents.length,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {allDayEvents.length > 0 && (
            <div className="border-b border-border bg-card mb-4">
              <div className="p-4">
                <div className="text-sm font-semibold text-foreground mb-3">
                  {t("event-calendar.calendar.fullDayEvents", {
                    count: allDayEvents.length,
                  })}
                </div>
                <div className="space-y-2">
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
            </div>
          )}

          <div
            ref={gridRef}
            className="relative flex"
            onPointerMove={handleGridPointerMove}
            onPointerLeave={handleGridPointerLeave}
          >
            <div className="w-28 shrink-0 bg-muted/30 border-r border-border">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="p-4 text-right border-b border-border"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="text-sm font-medium text-muted-foreground font-mono">
                    {formatTime(
                      `${hour.toString().padStart(2, "0")}:00`,
                      use24Hour,
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border hover:bg-accent/5 transition-colors"
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
                    className="absolute z-10 px-0.5"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${leftPercent}% + 2px)`,
                      width: `calc(${widthPercent}% - 4px)`,
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

            <CurrentTimeIndicator
              enabled={isTodayDate}
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
    </div>
  );
}
