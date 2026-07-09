import {
  CalendarEvent,
  CalendarView,
  EventColor,
  EventsByDate,
} from "@/lib/calendar/types";

function compareEventsByTime(a: CalendarEvent, b: CalendarEvent): number {
  if (a.startTime !== b.startTime) {
    return a.startTime.localeCompare(b.startTime);
  }

  if (a.endTime !== b.endTime) {
    return a.endTime.localeCompare(b.endTime);
  }

  return a.title.localeCompare(b.title);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

export function formatTime(time: string, use24Hour: boolean): string {
  if (!time) return "";

  const [hours, minutes] = time.split(":").map(Number);

  if (use24Hour) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

export function getMonthName(month: number): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[month];
}

export function getDayName(day: number): string {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[day];
}

export function organizeEventsByDate(events: CalendarEvent[]): EventsByDate {
  const eventsByDate: EventsByDate = {};

  events.forEach((event) => {
    const start = parseDate(event.startDate);
    const end = parseDate(event.endDate);
    const isMultiDay = event.startDate !== event.endDate;

    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = formatDate(currentDate);
      if (!eventsByDate[dateStr]) {
        eventsByDate[dateStr] = [];
      }

      if (isMultiDay) {
        const isFirstDay = formatDate(currentDate) === event.startDate;
        const isLastDay = formatDate(currentDate) === event.endDate;

        const adjustedEvent = {
          ...event,
          startTime: isFirstDay ? event.startTime : "00:00",
          endTime: isLastDay ? event.endTime : "23:59",
        };
        eventsByDate[dateStr].push(adjustedEvent);
      } else {
        eventsByDate[dateStr].push(event);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  Object.values(eventsByDate).forEach((dayEvents) => {
    dayEvents.sort(compareEventsByTime);
  });

  return eventsByDate;
}

export function getEventDuration(event: CalendarEvent): string {
  if (event.isAllDay) {
    return "00:00 - 23:59";
  }
  return `${event.startTime} - ${event.endTime}`;
}

export function isMultiDayEvent(event: CalendarEvent): boolean {
  return event.startDate !== event.endDate;
}

export function filterEventsByColors(
  events: CalendarEvent[],
  filterColors: EventColor[],
): CalendarEvent[] {
  if (filterColors.length === 0) {
    return events;
  }

  const activeColors = new Set(filterColors);
  return events.filter((event) => activeColors.has(event.color));
}

export function partitionEventsByAllDay(events: CalendarEvent[]): {
  allDayEvents: CalendarEvent[];
  timedEvents: CalendarEvent[];
} {
  return events.reduce(
    (partitions, event) => {
      if (event.isAllDay) {
        partitions.allDayEvents.push(event);
      } else {
        partitions.timedEvents.push(event);
      }

      return partitions;
    },
    { allDayEvents: [] as CalendarEvent[], timedEvents: [] as CalendarEvent[] },
  );
}

export function getEventTimePosition(
  event: CalendarEvent,
  hourHeight: number,
): { top: number; height: number } {
  const [startHour, startMinute] = event.startTime.split(":").map(Number);
  const [endHour, endMinute] = event.endTime.split(":").map(Number);

  const startDecimal = startHour + startMinute / 60;
  const endDecimal = endHour + endMinute / 60;

  return {
    top: startDecimal * hourHeight,
    height: (endDecimal - startDecimal) * hourHeight,
  };
}

export function clampTimeGridOffset(
  offset: number,
  hourHeight: number,
  totalHours = 24,
): number {
  const totalGridHeight = totalHours * hourHeight;
  return Math.max(0, Math.min(totalGridHeight, offset));
}

export function getTimeFromGridOffset(
  offset: number,
  hourHeight: number,
  totalHours = 24,
): string {
  const clampedOffset = clampTimeGridOffset(offset, hourHeight, totalHours);
  const roundedMinutes = Math.round((clampedOffset / hourHeight) * 12) * 5;
  const boundedMinutes = Math.min(roundedMinutes, totalHours * 60 - 1);
  const hours = Math.floor(boundedMinutes / 60);
  const minutes = boundedMinutes % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function getOffsetFromTime(time: string, hourHeight: number): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours + minutes / 60) * hourHeight;
}

export function isEventInDateRange(
  event: CalendarEvent,
  start: Date,
  end: Date,
): boolean {
  const eventStart = parseDate(event.startDate);
  const eventEnd = parseDate(event.endDate);
  return eventStart <= end && eventEnd >= start;
}

export function isDateInRange(
  dateStr: string,
  start: Date,
  end: Date,
): boolean {
  const date = parseDate(dateStr);
  return date >= start && date <= end;
}

export function getDateRangeForView(
  view: CalendarView,
  year: number,
  month: number,
  day: number,
): {
  start: Date;
  end: Date;
} {
  if (view === "day") {
    const selectedDate = new Date(year, month, day);
    return { start: selectedDate, end: selectedDate };
  }

  if (view === "week") {
    const weekDays = getWeekDays(new Date(year, month, day));
    return { start: weekDays[0], end: weekDays[6] };
  }

  if (view === "month") {
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0),
    };
  }

  return {
    start: new Date(year, 0, 1),
    end: new Date(year, 11, 31),
  };
}

export function getWeekDays(date: Date): Date[] {
  const day = date.getDay();
  const diff = date.getDate() - day;
  const sunday = new Date(date.setDate(diff));

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const weekDay = new Date(sunday);
    weekDay.setDate(sunday.getDate() + i);
    days.push(weekDay);
  }

  return days;
}

export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const daysInPrevMonth =
    month === 0
      ? getDaysInMonth(year - 1, 11)
      : getDaysInMonth(year, month - 1);

  const days: Date[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    days.push(new Date(prevYear, prevMonth, daysInPrevMonth - i));
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    days.push(new Date(nextYear, nextMonth, i));
  }

  return days;
}

export function getMonthDays(year: number, month: number): (Date | null)[] {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);

  const days: (Date | null)[] = [];

  // Add nulls for padding at the start of the month
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // Add actual days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  return days;
}
