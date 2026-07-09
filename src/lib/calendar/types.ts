export type CalendarEventColor =
  | "blue"
  | "green"
  | "yellow"
  | "pink"
  | "purple"
  | "orange"
  | "red"
  | "teal"
  | "indigo";

export type EventColor = CalendarEventColor;

export type CalendarView = "day" | "week" | "month" | "year";

export type CalendarDisplayMode = "calendar" | "list";

export interface CalendarEvent {
  /** Unique identifier for the calendar event. */
  id: string;
  /** Event title shown inside the calendar block. */
  title: string;
  /** Optional event notes or details. */
  description: string;
  /** Start date in YYYY-MM-DD format. */
  startDate: string;
  /** End date in YYYY-MM-DD format. */
  endDate: string;
  /** Start time in HH:mm format. */
  startTime: string;
  /** End time in HH:mm format. */
  endTime: string;
  /** Visual event color token. */
  color: CalendarEventColor;
  /** Whether the event spans the full day. */
  isAllDay: boolean;
}

export interface EventsByDate {
  [date: string]: CalendarEvent[];
}

export interface CalendarAppState {
  /** Whether times are displayed in 24-hour format. */
  use24Hour: boolean;
  /** Month currently visible in the embedded calendar, zero-based. */
  currentMonth: number;
  /** Year currently visible in the embedded calendar. */
  currentYear: number;
  /** Selected day in the visible month. */
  selectedDay: number;
  /** Active calendar view. */
  view: CalendarView;
  /** Whether the block shows the calendar grid or event list. */
  displayMode: CalendarDisplayMode;
  /** Event colors currently used as filters. */
  filterColors: CalendarEventColor[];
}

export interface CalendarNodeData {
  /** Schema version for future migrations. */
  version: 1;
  /** Events owned by this Tiptap calendar block. */
  events: CalendarEvent[];
  /** UI state owned by this Tiptap calendar block. */
  appState: CalendarAppState;
}
