import {
  formatDate,
  getMonthDays,
  isToday,
} from "@/lib/calendar/calendar-utils";
import { EventsByDate } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface YearViewProps {
  year: number;
  eventsByDate: EventsByDate;
  onMonthClick: (month: number) => void;
}

const MONTH_INDEXES = Array.from({ length: 12 }, (_, i) => i);

interface YearMonthProps {
  monthIndex: number;
  days: (Date | null)[];
  eventsByDate: EventsByDate;
  onMonthClick: (month: number) => void;
}

const YearMonth = memo(function YearMonth({
  monthIndex,
  days,
  eventsByDate,
  onMonthClick,
}: YearMonthProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const weekdayLabels = useMemo(() => {
    const baseDate = new Date(2024, 0, 7);
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "narrow" });

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + index);
      return formatter.format(date);
    });
  }, [locale]);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: "long" }).format(
        new Date(2024, monthIndex, 1),
      ),
    [locale, monthIndex],
  );
  const handleClick = useCallback(() => {
    onMonthClick(monthIndex);
  }, [monthIndex, onMonthClick]);

  return (
    <div
      className="border border-border rounded-lg p-3 hover:shadow-md transition-all cursor-pointer group"
      onClick={handleClick}
    >
      <div className="text-center font-semibold text-sm mb-2 group-hover:text-primary transition-colors">
        {monthLabel}
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekdayLabels.map((day, idx) => (
          <div
            key={idx}
            className="text-center text-[10px] font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, index) => {
          if (!day) {
            return <div key={`padding-${index}`} className="aspect-square" />;
          }

          const dateStr = formatDate(day);
          const dayEvents = eventsByDate[dateStr] || [];
          const hasEvents = dayEvents.length > 0;
          const isTodayDate = isToday(day);

          return (
            <div
              key={index}
              className={cn(
                "aspect-square flex items-center justify-center text-[10px] rounded-sm transition-colors",
                !isTodayDate && !hasEvents && "text-foreground",
                isTodayDate &&
                  "bg-primary text-primary-foreground font-semibold",
                !isTodayDate && hasEvents && "bg-accent/60 font-medium",
                !isTodayDate && !hasEvents && "hover:bg-accent/20",
              )}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function YearView({ year, eventsByDate, onMonthClick }: YearViewProps) {
  const monthDays = useMemo(
    () => MONTH_INDEXES.map((monthIndex) => getMonthDays(year, monthIndex)),
    [year],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 text-center sm:mb-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {year}
        </h2>
      </div>

      <div className="hover-scrollbar grid flex-1 grid-cols-2 gap-3 overflow-auto sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {MONTH_INDEXES.map((monthIndex) => (
          <YearMonth
            key={monthIndex}
            monthIndex={monthIndex}
            days={monthDays[monthIndex]}
            eventsByDate={eventsByDate}
            onMonthClick={onMonthClick}
          />
        ))}
      </div>
    </div>
  );
}
