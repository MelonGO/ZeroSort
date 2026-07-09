import type {
  CalendarAppState,
  CalendarDisplayMode,
  CalendarEvent,
  CalendarEventColor,
  CalendarNodeData,
  CalendarView,
} from "@/lib/calendar/types";

const calendarEventColors = new Set<CalendarEventColor>([
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "orange",
  "red",
  "teal",
  "indigo",
]);
const calendarViews = new Set<CalendarView>(["day", "week", "month", "year"]);
const calendarDisplayModes = new Set<CalendarDisplayMode>(["calendar", "list"]);

const DEFAULT_EVENT_COLOR: CalendarEventColor = "blue";
const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "10:00";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeCalendarEvent(value: unknown): CalendarEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const startDate = isDateString(value.startDate) ? value.startDate : null;
  const endDate = isDateString(value.endDate) ? value.endDate : startDate;

  if (!title || !startDate || !endDate) {
    return null;
  }

  const color = calendarEventColors.has(value.color as CalendarEventColor)
    ? (value.color as CalendarEventColor)
    : DEFAULT_EVENT_COLOR;

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : createCalendarEventId(),
    title,
    description: typeof value.description === "string" ? value.description : "",
    startDate,
    endDate,
    startTime: isTimeString(value.startTime)
      ? value.startTime
      : DEFAULT_START_TIME,
    endTime: isTimeString(value.endTime) ? value.endTime : DEFAULT_END_TIME,
    color,
    isAllDay: Boolean(value.isAllDay),
  };
}

function normalizeAppState(value: unknown): CalendarAppState {
  const today = new Date();
  const fallbackYear = today.getFullYear();
  const fallbackMonth = today.getMonth();
  const fallbackDay = today.getDate();
  const source = isRecord(value) ? value : {};
  const currentYear = normalizeNumber(source.currentYear, fallbackYear);
  const currentMonth = Math.min(
    11,
    Math.max(0, normalizeNumber(source.currentMonth, fallbackMonth)),
  );
  const selectedDay = clampDay(
    currentYear,
    currentMonth,
    Math.max(1, normalizeNumber(source.selectedDay, fallbackDay)),
  );
  const view = calendarViews.has(source.view as CalendarView)
    ? (source.view as CalendarView)
    : "month";
  const displayMode = calendarDisplayModes.has(
    source.displayMode as CalendarDisplayMode,
  )
    ? (source.displayMode as CalendarDisplayMode)
    : "calendar";
  const filterColors = Array.isArray(source.filterColors)
    ? source.filterColors.filter((color): color is CalendarEventColor =>
        calendarEventColors.has(color as CalendarEventColor),
      )
    : [];

  return {
    use24Hour: Boolean(source.use24Hour),
    currentMonth,
    currentYear,
    selectedDay,
    view,
    displayMode,
    filterColors,
  };
}

export function createCalendarEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `cal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createDefaultCalendarNodeData(): CalendarNodeData {
  return {
    version: 1,
    events: [],
    appState: normalizeAppState(null),
  };
}

export function normalizeCalendarNodeData(value: unknown): CalendarNodeData {
  if (typeof value === "string") {
    try {
      return normalizeCalendarNodeData(JSON.parse(value));
    } catch {
      return createDefaultCalendarNodeData();
    }
  }

  if (!isRecord(value)) {
    return createDefaultCalendarNodeData();
  }

  const events = Array.isArray(value.events)
    ? value.events
        .map((event) => normalizeCalendarEvent(event))
        .filter((event): event is CalendarEvent => event !== null)
    : [];

  return {
    version: 1,
    events,
    appState: normalizeAppState(value.appState),
  };
}

export function serializeCalendarNodeData(data: CalendarNodeData): string {
  return JSON.stringify(normalizeCalendarNodeData(data));
}

export function getCalendarEventColorClassName(
  color: CalendarEventColor,
): string {
  const colorClassNames: Record<CalendarEventColor, string> = {
    blue: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    green:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    yellow:
      "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    pink: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    purple:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    orange:
      "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    indigo:
      "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  };

  return colorClassNames[color];
}
