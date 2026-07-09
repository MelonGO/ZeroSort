import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsLargeScreen } from "@/hooks/useIsLargeScreen";
import { isSupportedLanguage } from "@/i18n";
import { AIService } from "@/lib/calendar/aiService";
import type { AIMessage, PendingCalendarAction } from "@/lib/calendar/aiTypes";
import {
  filterEventsByColors,
  formatDate,
  getDaysInMonth,
  getWeekDays,
  organizeEventsByDate,
} from "@/lib/calendar/calendar-utils";
import { CalendarAIProvider } from "@/lib/calendar/calendarAiProvider";
import { CalendarAPIService } from "@/lib/calendar/calendarApi";
import {
  normalizeCalendarNodeData,
  serializeCalendarNodeData,
} from "@/lib/calendar/calendarData";
import { EVENT_COLOR_OPTIONS } from "@/lib/calendar/event-colors";
import type {
  CalendarAppState,
  CalendarEvent,
  CalendarNodeData,
  CalendarView,
} from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns2,
  Filter,
  Grid3X3,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AIAssistant } from "./AIAssistant";
import { DayView } from "./DayView";
import { EventDialog } from "./EventDialog";
import { ListView } from "./ListView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { YearPicker } from "./YearPicker";
import { YearView } from "./YearView";

interface CalendarDialogState {
  open: boolean;
  selectedDate?: string;
  selectedEndDate?: string;
  selectedStartTime?: string;
  selectedEvent?: CalendarEvent;
}

interface CalendarState extends CalendarAppState {
  events: CalendarEvent[];
  dialog: CalendarDialogState;
}

type EventChangeKind = "created" | "updated" | "deleted";

interface EventChangeNotice {
  eventId: string;
  date: string;
  title: string;
  kind: EventChangeKind;
  token: number;
}

type CalendarAction =
  | { type: "navigate"; direction: "previous" | "next" }
  | { type: "jump-to-today"; resetView?: CalendarView }
  | { type: "set-day"; day: number }
  | { type: "set-month"; month: number }
  | { type: "set-year"; year: number }
  | { type: "set-view"; view: CalendarView }
  | { type: "set-display-mode"; displayMode: CalendarAppState["displayMode"] }
  | { type: "toggle-time-format" }
  | { type: "toggle-filter"; color: CalendarEvent["color"] }
  | { type: "open-date-dialog"; date: string }
  | { type: "open-time-dialog"; date: string; time: string }
  | { type: "open-event-dialog"; event: CalendarEvent }
  | { type: "open-create-dialog" }
  | { type: "set-month-and-view"; month: number; view: CalendarView }
  | { type: "jump-to-event-date"; date: string }
  | { type: "save-event"; event: CalendarEvent }
  | { type: "delete-event"; eventId: string }
  | { type: "set-events"; events: CalendarEvent[] }
  | { type: "set-dialog-open"; open: boolean }
  | { type: "apply-data"; data: CalendarNodeData };

interface EmbeddedEventCalendarProps {
  data: CalendarNodeData;
  onChange: (data: CalendarNodeData) => void;
  className?: string;
}

const today = new Date();

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, getDaysInMonth(year, month));
}

function createClosedDialogState(): CalendarDialogState {
  return { open: false };
}

function createDialogStateForView(state: CalendarState): CalendarDialogState {
  if (state.view === "day") {
    const dayDate = formatDate(
      new Date(state.currentYear, state.currentMonth, state.selectedDay),
    );

    return {
      open: true,
      selectedDate: dayDate,
      selectedEndDate: dayDate,
    };
  }

  if (state.view === "week") {
    const weekDays = getWeekDays(
      new Date(state.currentYear, state.currentMonth, state.selectedDay),
    );

    return {
      open: true,
      selectedDate: formatDate(weekDays[0]),
      selectedEndDate: formatDate(weekDays[6]),
    };
  }

  return {
    open: true,
    selectedDate: formatDate(new Date()),
  };
}

function withCurrentDate(state: CalendarState, nextDate: Date): CalendarState {
  return {
    ...state,
    currentYear: nextDate.getFullYear(),
    currentMonth: nextDate.getMonth(),
    selectedDay: nextDate.getDate(),
  };
}

function getCalendarDateFromValue(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function eventsMatch(a: CalendarEvent, b: CalendarEvent): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.color === b.color &&
    a.isAllDay === b.isAllDay
  );
}

function detectEventChange(
  previousEvents: CalendarEvent[],
  nextEvents: CalendarEvent[],
): Omit<EventChangeNotice, "token"> | null {
  const previousEventsById = new Map(
    previousEvents.map((event) => [event.id, event]),
  );
  const nextEventsById = new Map(nextEvents.map((event) => [event.id, event]));

  for (const event of nextEvents) {
    const previousEvent = previousEventsById.get(event.id);

    if (!previousEvent) {
      return {
        eventId: event.id,
        date: event.startDate,
        title: event.title,
        kind: "created",
      };
    }

    if (!eventsMatch(previousEvent, event)) {
      return {
        eventId: event.id,
        date: event.startDate,
        title: event.title,
        kind: "updated",
      };
    }
  }

  for (const event of previousEvents) {
    if (!nextEventsById.has(event.id)) {
      return {
        eventId: event.id,
        date: event.startDate,
        title: event.title,
        kind: "deleted",
      };
    }
  }

  return null;
}

function getNextPosition(
  state: CalendarState,
  direction: "previous" | "next",
): Date {
  const offset = direction === "previous" ? -1 : 1;

  if (state.view === "month") {
    const nextMonthAnchor = new Date(
      state.currentYear,
      state.currentMonth + offset,
      1,
    );

    return new Date(
      nextMonthAnchor.getFullYear(),
      nextMonthAnchor.getMonth(),
      clampDay(
        nextMonthAnchor.getFullYear(),
        nextMonthAnchor.getMonth(),
        state.selectedDay,
      ),
    );
  }

  if (state.view === "year") {
    return new Date(
      state.currentYear + offset,
      state.currentMonth,
      clampDay(
        state.currentYear + offset,
        state.currentMonth,
        state.selectedDay,
      ),
    );
  }

  const nextDate = new Date(
    state.currentYear,
    state.currentMonth,
    state.selectedDay,
  );
  nextDate.setDate(
    nextDate.getDate() + (state.view === "week" ? offset * 7 : offset),
  );
  return nextDate;
}

function createCalendarState(data: CalendarNodeData): CalendarState {
  const normalizedData = normalizeCalendarNodeData(data);

  return {
    ...normalizedData.appState,
    events: normalizedData.events,
    dialog: createClosedDialogState(),
  };
}

function getSerializableData(state: CalendarState): CalendarNodeData {
  return {
    version: 1,
    events: state.events,
    appState: {
      use24Hour: state.use24Hour,
      currentMonth: state.currentMonth,
      currentYear: state.currentYear,
      selectedDay: state.selectedDay,
      view: state.view,
      displayMode: state.displayMode,
      filterColors: state.filterColors,
    },
  };
}

function calendarReducer(
  state: CalendarState,
  action: CalendarAction,
): CalendarState {
  switch (action.type) {
    case "navigate":
      return withCurrentDate(state, getNextPosition(state, action.direction));
    case "jump-to-today": {
      const nextState = {
        ...state,
        currentMonth: today.getMonth(),
        currentYear: today.getFullYear(),
        selectedDay: today.getDate(),
      };

      return action.resetView
        ? { ...nextState, view: action.resetView }
        : nextState;
    }
    case "set-day":
      return {
        ...state,
        selectedDay: clampDay(
          state.currentYear,
          state.currentMonth,
          action.day,
        ),
      };
    case "set-month":
      return {
        ...state,
        currentMonth: action.month,
        selectedDay: clampDay(
          state.currentYear,
          action.month,
          state.selectedDay,
        ),
      };
    case "set-year":
      return {
        ...state,
        currentYear: action.year,
        selectedDay: clampDay(
          action.year,
          state.currentMonth,
          state.selectedDay,
        ),
      };
    case "set-view":
      return { ...state, view: action.view };
    case "set-display-mode":
      return { ...state, displayMode: action.displayMode };
    case "toggle-time-format":
      return { ...state, use24Hour: !state.use24Hour };
    case "toggle-filter":
      return {
        ...state,
        filterColors: state.filterColors.includes(action.color)
          ? state.filterColors.filter((color) => color !== action.color)
          : [...state.filterColors, action.color],
      };
    case "open-date-dialog":
      return {
        ...state,
        dialog: {
          open: true,
          selectedDate: action.date,
          selectedEndDate: action.date,
        },
      };
    case "open-time-dialog":
      return {
        ...state,
        dialog: {
          open: true,
          selectedDate: action.date,
          selectedEndDate: action.date,
          selectedStartTime: action.time,
        },
      };
    case "open-event-dialog":
      return {
        ...state,
        dialog: { open: true, selectedEvent: action.event },
      };
    case "open-create-dialog":
      return { ...state, dialog: createDialogStateForView(state) };
    case "set-month-and-view":
      return {
        ...state,
        currentMonth: action.month,
        selectedDay: clampDay(
          state.currentYear,
          action.month,
          state.selectedDay,
        ),
        view: action.view,
      };
    case "jump-to-event-date": {
      const eventDate = getCalendarDateFromValue(action.date);

      return {
        ...state,
        currentMonth: eventDate.getMonth(),
        currentYear: eventDate.getFullYear(),
        selectedDay: eventDate.getDate(),
        view: "day",
        displayMode: "calendar",
      };
    }
    case "save-event": {
      const existingIndex = state.events.findIndex(
        (event) => event.id === action.event.id,
      );

      if (existingIndex >= 0) {
        const nextEvents = [...state.events];
        nextEvents[existingIndex] = action.event;
        return { ...state, events: nextEvents };
      }

      return { ...state, events: [...state.events, action.event] };
    }
    case "delete-event":
      return {
        ...state,
        events: state.events.filter((event) => event.id !== action.eventId),
      };
    case "set-events":
      return { ...state, events: action.events };
    case "set-dialog-open":
      return {
        ...state,
        dialog: action.open ? state.dialog : createClosedDialogState(),
      };
    case "apply-data":
      return createCalendarState(action.data);
    default:
      return state;
  }
}

/** Embeds the event-calendar-pro experience inside a serialized note block. */
export function EmbeddedEventCalendar({
  data,
  onChange,
  className,
}: EmbeddedEventCalendarProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const modelConfigs = useStore((store) => store.modelConfigs);
  const activeConfigId = useStore((store) => store.activeConfigId);
  const selectedModelId = useStore((store) => store.selectedModelId);
  const [state, dispatch] = useReducer(
    calendarReducer,
    data,
    createCalendarState,
  );
  const [eventChangeNotice, setEventChangeNotice] =
    useState<EventChangeNotice | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [pendingAIConfirmation, setPendingAIConfirmation] = useState<
    PendingCalendarAction | undefined
  >();
  const [aiProcessing, setAiProcessing] = useState(false);
  const onChangeRef = useRef(onChange);
  const hasHydratedRef = useRef(false);
  const isApplyingIncomingDataRef = useRef(false);
  const latestSerializedDataRef = useRef(serializeCalendarNodeData(data));
  const eventsSnapshotRef = useRef<CalendarEvent[]>([]);
  const calendarAPIRef = useRef<CalendarAPIService | null>(null);
  const aiServiceRef = useRef<AIService | null>(null);
  const aiSelectionRef = useRef({
    config: modelConfigs.find((config) => config.id === activeConfigId) || null,
    modelId: selectedModelId,
  });
  const isMobile = !useIsLargeScreen();
  const isCompactToolbar = !useIsLargeScreen(1100);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const serializedData = serializeCalendarNodeData(data);

    if (serializedData === latestSerializedDataRef.current) {
      return;
    }

    latestSerializedDataRef.current = serializedData;
    isApplyingIncomingDataRef.current = true;
    dispatch({ type: "apply-data", data });
  }, [data]);

  const filteredEvents = useMemo(
    () => filterEventsByColors(state.events, state.filterColors),
    [state.events, state.filterColors],
  );
  const filteredEventsByDate = useMemo(
    () => organizeEventsByDate(filteredEvents),
    [filteredEvents],
  );
  const selectedDate = useMemo(
    () => new Date(state.currentYear, state.currentMonth, state.selectedDay),
    [state.currentMonth, state.currentYear, state.selectedDay],
  );
  const selectedWeekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const dayNumberFormatter = useMemo(
    () => new Intl.NumberFormat(locale),
    [locale],
  );
  const selectedWeekdayLabel = useMemo(
    () => selectedWeekdayFormatter.format(selectedDate),
    [selectedDate, selectedWeekdayFormatter],
  );
  const selectedDayLabel = useMemo(
    () => dayNumberFormatter.format(state.selectedDay),
    [dayNumberFormatter, state.selectedDay],
  );
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => ({
        value: monthIndex.toString(),
        label: new Intl.DateTimeFormat(locale, { month: "long" }).format(
          new Date(state.currentYear, monthIndex, 1),
        ),
      })),
    [locale, state.currentYear],
  );
  const dayOptions = useMemo(
    () =>
      Array.from(
        { length: getDaysInMonth(state.currentYear, state.currentMonth) },
        (_, index) => ({
          value: (index + 1).toString(),
          label: dayNumberFormatter.format(index + 1),
        }),
      ),
    [dayNumberFormatter, state.currentMonth, state.currentYear],
  );

  useEffect(() => {
    const nextData = getSerializableData(state);
    const nextSerializedData = serializeCalendarNodeData(nextData);

    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      latestSerializedDataRef.current = nextSerializedData;
      return;
    }

    if (isApplyingIncomingDataRef.current) {
      isApplyingIncomingDataRef.current = false;
      latestSerializedDataRef.current = nextSerializedData;
      return;
    }

    latestSerializedDataRef.current = nextSerializedData;
    onChangeRef.current(nextData);
  }, [state]);

  useEffect(() => {
    if (!eventChangeNotice || eventChangeNotice.kind === "deleted") {
      return;
    }

    window.requestAnimationFrame(() => {
      const eventCard = document.querySelector<HTMLElement>(
        `[data-event-card-id="${CSS.escape(eventChangeNotice.eventId)}"]`,
      );

      eventCard?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    });
  }, [eventChangeNotice]);

  useEffect(() => {
    if (!eventChangeNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEventChangeNotice((currentNotice) =>
        currentNotice?.token === eventChangeNotice.token ? null : currentNotice,
      );
    }, 4200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [eventChangeNotice]);

  const focusChangedEvent = useCallback(
    (change: Omit<EventChangeNotice, "token">) => {
      dispatch({ type: "jump-to-event-date", date: change.date });
      setEventChangeNotice({ ...change, token: Date.now() });
    },
    [],
  );

  useEffect(() => {
    aiSelectionRef.current = {
      config:
        modelConfigs.find((config) => config.id === activeConfigId) || null,
      modelId: selectedModelId,
    };
  }, [activeConfigId, modelConfigs, selectedModelId]);

  useEffect(() => {
    const handleEventsChange = (events: CalendarEvent[]) => {
      const eventChange = detectEventChange(eventsSnapshotRef.current, events);

      dispatch({ type: "set-events", events });

      if (eventChange) {
        focusChangedEvent(eventChange);
      }
    };

    calendarAPIRef.current = new CalendarAPIService([], handleEventsChange);
    aiServiceRef.current = new AIService(
      calendarAPIRef.current,
      new CalendarAIProvider(() => aiSelectionRef.current),
      false,
    );
  }, [focusChangedEvent]);

  useEffect(() => {
    calendarAPIRef.current?.setEvents(state.events);
    eventsSnapshotRef.current = state.events;
  }, [state.events]);

  useEffect(() => {
    const activeLanguage = i18n.resolvedLanguage || i18n.language;

    aiServiceRef.current?.updatePreferences({
      language: isSupportedLanguage(activeLanguage)
        ? activeLanguage
        : undefined,
      use24Hour: state.use24Hour,
      currentViewDate: formatDate(selectedDate),
    });
  }, [i18n.language, i18n.resolvedLanguage, selectedDate, state.use24Hour]);

  const handleDateClick = useCallback((date: string) => {
    dispatch({ type: "open-date-dialog", date });
  }, []);

  const handleTimeSelect = useCallback((date: string, time: string) => {
    dispatch({ type: "open-time-dialog", date, time });
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    dispatch({ type: "open-event-dialog", event });
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    dispatch({ type: "set-dialog-open", open });
  }, []);

  const handleMonthClick = useCallback((month: number) => {
    dispatch({ type: "set-month-and-view", month, view: "month" });
  }, []);

  const handleSaveEvent = useCallback(
    (event: CalendarEvent) => {
      const existingEvent = state.events.find(
        (candidate) => candidate.id === event.id,
      );

      dispatch({ type: "save-event", event });
      focusChangedEvent({
        eventId: event.id,
        date: event.startDate,
        title: event.title,
        kind: existingEvent ? "updated" : "created",
      });
    },
    [focusChangedEvent, state.events],
  );

  const handleDeleteEvent = useCallback(
    (eventId: string) => {
      const existingEvent = state.events.find((event) => event.id === eventId);
      dispatch({ type: "delete-event", eventId });

      if (existingEvent) {
        focusChangedEvent({
          eventId: existingEvent.id,
          date: existingEvent.startDate,
          title: existingEvent.title,
          kind: "deleted",
        });
      }
    },
    [focusChangedEvent, state.events],
  );

  const handleAIMessage = useCallback(async (message: string) => {
    if (!aiServiceRef.current) {
      return;
    }

    setAiProcessing(true);

    try {
      const processingPromise = aiServiceRef.current.processMessage(message);

      setAiMessages(aiServiceRef.current.getMessages());
      setPendingAIConfirmation(aiServiceRef.current.getPendingConfirmation());

      await processingPromise;
      setAiMessages(aiServiceRef.current.getMessages());
      setPendingAIConfirmation(aiServiceRef.current.getPendingConfirmation());
    } catch (error) {
      console.error("AI calendar processing error:", error);
    } finally {
      setAiProcessing(false);
    }
  }, []);

  const handleAIConfirm = useCallback(async () => {
    if (!aiServiceRef.current) {
      return;
    }

    setAiProcessing(true);

    try {
      await aiServiceRef.current.confirmPendingAction();
      setAiMessages(aiServiceRef.current.getMessages());
      setPendingAIConfirmation(aiServiceRef.current.getPendingConfirmation());
    } catch (error) {
      console.error("AI calendar confirmation error:", error);
    } finally {
      setAiProcessing(false);
    }
  }, []);

  const handleAICancel = useCallback(() => {
    if (!aiServiceRef.current) {
      return;
    }

    aiServiceRef.current.cancelPendingAction();
    setAiMessages(aiServiceRef.current.getMessages());
    setPendingAIConfirmation(aiServiceRef.current.getPendingConfirmation());
  }, []);

  const handleAIReset = useCallback(() => {
    if (!aiServiceRef.current || aiProcessing) {
      return;
    }

    aiServiceRef.current.clearHistory();
    setAiMessages([]);
    setPendingAIConfirmation(undefined);
  }, [aiProcessing]);

  const handleToggleAI = useCallback(() => {
    setAiOpen((isOpen) => !isOpen);
  }, []);

  const periodActionLabel =
    state.view === "day"
      ? t("event-calendar.period.today")
      : state.view === "week"
        ? t("event-calendar.period.thisWeek")
        : state.view === "year"
          ? t("event-calendar.period.thisYear")
          : t("event-calendar.period.thisMonth");
  const pickerTriggerClassName =
    "h-10 rounded-xl border-border/80 bg-card px-3 text-left text-sm shadow-xs transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring/20";

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col gap-3 bg-background p-3 text-foreground",
        className,
      )}
    >
      <div className="grid gap-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:gap-x-4 xl:gap-y-3">
        <div className="flex w-full flex-col gap-3 xl:min-w-0">
          <div className="flex items-center justify-center gap-1.5 sm:justify-start sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full text-foreground/80 hover:bg-muted"
              onClick={() =>
                dispatch({ type: "navigate", direction: "previous" })
              }
              aria-label={t("event-calendar.nav.previousPeriod")}
            >
              <ChevronLeft />
            </Button>

            {!isMobile && (
              <Select
                value={state.selectedDay.toString()}
                onValueChange={(value) =>
                  dispatch({ type: "set-day", day: parseInt(value, 10) })
                }
              >
                <SelectTrigger
                  aria-label={t("event-calendar.controls.selectDay")}
                  className={cn(
                    isCompactToolbar ? "w-32 gap-2" : "w-36 gap-3",
                    pickerTriggerClassName,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-medium italic text-muted-foreground">
                      {selectedWeekdayLabel}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {selectedDayLabel}
                    </span>
                  </span>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {dayOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-3">
                        <span className="w-8 text-sm italic text-muted-foreground">
                          {selectedWeekdayFormatter.format(
                            new Date(
                              state.currentYear,
                              state.currentMonth,
                              parseInt(option.value, 10),
                            ),
                          )}
                        </span>
                        <span className="font-medium">{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={state.currentMonth.toString()}
              onValueChange={(value) =>
                dispatch({ type: "set-month", month: parseInt(value, 10) })
              }
            >
              <SelectTrigger
                aria-label={t("event-calendar.controls.selectMonth")}
                className={cn(
                  "min-w-0 gap-3",
                  isCompactToolbar
                    ? "w-34 flex-none"
                    : "flex-1 sm:w-40 sm:flex-none",
                  pickerTriggerClassName,
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <CalendarDays className="text-muted-foreground" />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {monthOptions[state.currentMonth]?.label}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <YearPicker
              value={state.currentYear}
              onChange={(year) => dispatch({ type: "set-year", year })}
              className={cn(
                "h-10 rounded-xl border-border/80 bg-card text-sm font-semibold shadow-xs hover:bg-accent/35",
                isCompactToolbar ? "w-22 px-2" : "w-24 px-3",
                isMobile && "flex-none",
              )}
            />

            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 rounded-full text-foreground/80 hover:bg-muted"
              onClick={() => dispatch({ type: "navigate", direction: "next" })}
              aria-label={t("event-calendar.nav.nextPeriod")}
            >
              <ChevronRight />
            </Button>
          </div>

          {isMobile && state.view === "day" && (
            <Select
              value={state.selectedDay.toString()}
              onValueChange={(value) =>
                dispatch({ type: "set-day", day: parseInt(value, 10) })
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl px-4 text-sm">
                <SelectValue placeholder={t("event-calendar.view.day")} />
              </SelectTrigger>
              <SelectContent>
                {dayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2.5 xl:w-auto xl:items-end">
          <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch({ type: "toggle-time-format" })}
              className="h-10 w-full justify-center rounded-xl px-3 text-sm sm:w-auto sm:rounded-md sm:px-2"
            >
              <Clock className="mr-2" />
              {state.use24Hour
                ? t("event-calendar.time.twentyFourHour")
                : t("event-calendar.time.twelveHour")}
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 w-full justify-center rounded-xl px-3 text-sm sm:w-auto sm:rounded-md sm:px-3"
                >
                  <Filter className="mr-2" />
                  {t("event-calendar.filters.filter")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(16rem,calc(100vw-2rem))] sm:w-64">
                <div className="space-y-3">
                  <div className="text-sm font-semibold">
                    {t("event-calendar.filters.byColor")}
                  </div>
                  {EVENT_COLOR_OPTIONS.map((colorOption) => (
                    <div
                      key={colorOption.value}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`filter-${colorOption.value}`}
                        checked={state.filterColors.includes(colorOption.value)}
                        onCheckedChange={() =>
                          dispatch({
                            type: "toggle-filter",
                            color: colorOption.value,
                          })
                        }
                      />
                      <Label
                        htmlFor={`filter-${colorOption.value}`}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <div
                          className={cn("size-4 rounded", colorOption.bgClass)}
                        />
                        {t(`event-calendar.colors.${colorOption.value}`)}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                dispatch({
                  type: "jump-to-today",
                  ...(state.view === "month"
                    ? { resetView: "month" as CalendarView }
                    : {}),
                })
              }
              className="h-10 w-full justify-center rounded-xl px-3 text-sm sm:w-auto sm:rounded-md sm:px-3"
            >
              <CalendarDays className="mr-2" />
              {periodActionLabel}
            </Button>

            {isMobile && (
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-full rounded-xl sm:hidden"
                aria-label={
                  state.displayMode === "calendar"
                    ? t("event-calendar.display.switchToList")
                    : t("event-calendar.display.switchToCalendar")
                }
                onClick={() =>
                  dispatch({
                    type: "set-display-mode",
                    displayMode:
                      state.displayMode === "calendar" ? "list" : "calendar",
                  })
                }
              >
                {state.displayMode === "calendar" ? <List /> : <CalendarDays />}
              </Button>
            )}
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <ToggleGroup
              type="single"
              value={state.displayMode}
              onValueChange={(value) =>
                value &&
                dispatch({
                  type: "set-display-mode",
                  displayMode: value as CalendarAppState["displayMode"],
                })
              }
              className="hidden rounded-xl border sm:inline-flex"
            >
              <ToggleGroupItem
                value="calendar"
                aria-label={t("event-calendar.display.calendar")}
                className="size-10"
              >
                <CalendarDays />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label={t("event-calendar.display.list")}
                className="size-10"
              >
                <List />
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={state.view}
              onValueChange={(value) =>
                value &&
                dispatch({ type: "set-view", view: value as CalendarView })
              }
              className="grid min-w-0 flex-1 grid-cols-4 rounded-xl border bg-background/70 p-1 sm:min-w-84 sm:flex-none sm:rounded-md sm:bg-transparent sm:p-0"
            >
              <ToggleGroupItem
                value="day"
                aria-label={t("event-calendar.view.day")}
                className="min-h-10 gap-1 px-2 text-xs"
              >
                <Calendar />
                <span className="hidden xl:inline">
                  {t("event-calendar.view.day")}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="week"
                aria-label={t("event-calendar.view.week")}
                className="min-h-10 gap-1 px-2 text-xs"
              >
                <Columns2 />
                <span className="hidden xl:inline">
                  {t("event-calendar.view.week")}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="month"
                aria-label={t("event-calendar.view.month")}
                className="min-h-10 gap-1 px-2 text-xs"
              >
                <Grid3X3 />
                <span className="hidden xl:inline">
                  {t("event-calendar.view.month")}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="year"
                aria-label={t("event-calendar.view.year")}
                className="min-h-10 gap-1 px-2 text-xs"
              >
                <LayoutGrid />
                <span className="hidden xl:inline">
                  {t("event-calendar.view.year")}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>

            <Button
              onClick={() => dispatch({ type: "open-create-dialog" })}
              className="h-10 w-full rounded-xl text-sm font-semibold sm:w-auto sm:min-w-32 sm:rounded-md"
            >
              <Plus className="mr-2" strokeWidth={2.5} />
              {t("event-calendar.actions.addEvent")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 p-2 shadow-sm lg:p-3">
        {eventChangeNotice && (
          <div
            className="mb-3 rounded-lg border border-primary/15 bg-background px-3 py-2 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              <span className="shrink-0 font-semibold">
                {t(`event-calendar.notice.${eventChangeNotice.kind}`)}
              </span>
              <span className="min-w-0 truncate text-muted-foreground">
                {eventChangeNotice.title}
              </span>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {state.displayMode === "calendar" && state.view === "month" && (
            <MonthView
              year={state.currentYear}
              month={state.currentMonth}
              eventsByDate={filteredEventsByDate}
              use24Hour={state.use24Hour}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              highlightedEventId={
                eventChangeNotice?.kind !== "deleted"
                  ? eventChangeNotice?.eventId
                  : undefined
              }
              highlightToken={eventChangeNotice?.token}
            />
          )}

          {state.displayMode === "calendar" && state.view === "week" && (
            <WeekView
              year={state.currentYear}
              month={state.currentMonth}
              day={state.selectedDay}
              eventsByDate={filteredEventsByDate}
              use24Hour={state.use24Hour}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              onTimeSelect={handleTimeSelect}
              highlightedEventId={
                eventChangeNotice?.kind !== "deleted"
                  ? eventChangeNotice?.eventId
                  : undefined
              }
              highlightToken={eventChangeNotice?.token}
            />
          )}

          {state.displayMode === "calendar" && state.view === "day" && (
            <DayView
              year={state.currentYear}
              month={state.currentMonth}
              day={state.selectedDay}
              eventsByDate={filteredEventsByDate}
              use24Hour={state.use24Hour}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
              onTimeSelect={handleTimeSelect}
              highlightedEventId={
                eventChangeNotice?.kind !== "deleted"
                  ? eventChangeNotice?.eventId
                  : undefined
              }
              highlightToken={eventChangeNotice?.token}
            />
          )}

          {state.displayMode === "list" && (
            <ListView
              filteredEvents={filteredEvents}
              use24Hour={state.use24Hour}
              onEventClick={handleEventClick}
              view={state.view}
              year={state.currentYear}
              month={state.currentMonth}
              day={state.selectedDay}
              highlightedEventId={
                eventChangeNotice?.kind !== "deleted"
                  ? eventChangeNotice?.eventId
                  : undefined
              }
              highlightToken={eventChangeNotice?.token}
            />
          )}

          {state.view === "year" && state.displayMode === "calendar" && (
            <YearView
              year={state.currentYear}
              eventsByDate={filteredEventsByDate}
              onMonthClick={handleMonthClick}
            />
          )}
        </div>
      </div>

      <EventDialog
        open={state.dialog.open}
        onOpenChange={handleDialogOpenChange}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        initialDate={state.dialog.selectedDate}
        initialEndDate={state.dialog.selectedEndDate}
        initialStartTime={state.dialog.selectedStartTime}
        event={state.dialog.selectedEvent}
      />

      <AIAssistant
        onSubmit={handleAIMessage}
        onConfirm={handleAIConfirm}
        onCancel={handleAICancel}
        onReset={handleAIReset}
        messages={aiMessages}
        pendingConfirmation={pendingAIConfirmation}
        isProcessing={aiProcessing}
        isOpen={aiOpen}
        onToggle={handleToggleAI}
      />
    </div>
  );
}
