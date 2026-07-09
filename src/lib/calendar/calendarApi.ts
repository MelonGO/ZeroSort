import type { AICalendarAPI, EventFilters, TimeRange } from "./aiTypes";
import { parseDate } from "./calendar-utils";
import type { CalendarEvent } from "./types";

/** Provides an imperative API over the embedded calendar event list. */
export class CalendarAPIService implements AICalendarAPI {
  private events: CalendarEvent[];
  private onEventsChange: (events: CalendarEvent[]) => void;

  constructor(
    events: CalendarEvent[],
    onEventsChange: (events: CalendarEvent[]) => void,
  ) {
    this.events = events;
    this.onEventsChange = onEventsChange;
  }

  /** Updates the current event snapshot used by AI operations. */
  setEvents(events: CalendarEvent[]) {
    this.events = events;
  }

  /** Returns a copy of the current event snapshot. */
  getEvents(): CalendarEvent[] {
    return [...this.events];
  }

  /** Creates a new event. */
  async createEvent(params: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const startDate = params.startDate || this.getTodayDateString();
    const newEvent: CalendarEvent = {
      id: this.generateId(),
      title: params.title || "Untitled Event",
      description: params.description || "",
      startDate,
      endDate: params.endDate || startDate,
      startTime: params.startTime || "09:00",
      endTime: params.endTime || "10:00",
      color: params.color || "blue",
      isAllDay: params.isAllDay || false,
    };

    this.replaceEvents([...this.events, newEvent]);
    return newEvent;
  }

  /** Updates an existing event. */
  async updateEvent(
    id: string,
    params: Partial<CalendarEvent>,
  ): Promise<CalendarEvent> {
    const eventIndex = this.events.findIndex((event) => event.id === id);

    if (eventIndex === -1) {
      throw new Error(`Event with id ${id} not found`);
    }

    const updatedEvent: CalendarEvent = {
      ...this.events[eventIndex],
      ...params,
      id,
    };
    const updatedEvents = [...this.events];
    updatedEvents[eventIndex] = updatedEvent;
    this.replaceEvents(updatedEvents);

    return updatedEvent;
  }

  /** Deletes an event by ID. */
  async deleteEvent(id: string): Promise<void> {
    const updatedEvents = this.events.filter((event) => event.id !== id);

    if (updatedEvents.length === this.events.length) {
      throw new Error(`Event with id ${id} not found`);
    }

    this.replaceEvents(updatedEvents);
  }

  /** Queries events by date range, color, text, and all-day status. */
  async queryEvents(filters: EventFilters): Promise<CalendarEvent[]> {
    let results = [...this.events];

    if (filters.dateFrom || filters.dateTo) {
      const dateFrom = filters.dateFrom
        ? parseDate(filters.dateFrom)
        : new Date(0);
      const dateTo = filters.dateTo
        ? parseDate(filters.dateTo)
        : new Date("2100-01-01T00:00:00");

      results = results.filter((event) => {
        const eventStart = parseDate(event.startDate);
        const eventEnd = parseDate(event.endDate);
        return eventStart <= dateTo && eventEnd >= dateFrom;
      });
    }

    if (filters.colors?.length) {
      const colors = new Set(filters.colors);
      results = results.filter((event) => colors.has(event.color));
    }

    if (filters.searchTerm) {
      const searchTerm = filters.searchTerm.toLowerCase();
      results = results.filter(
        (event) =>
          event.title.toLowerCase().includes(searchTerm) ||
          event.description.toLowerCase().includes(searchTerm),
      );
    }

    if (filters.isAllDay !== undefined) {
      results = results.filter((event) => event.isAllDay === filters.isAllDay);
    }

    return results;
  }

  /** Checks whether a time range has no overlapping events. */
  async checkAvailability(timeRange: TimeRange): Promise<boolean> {
    const { date, start, end } = timeRange;
    const eventsOnDate = this.events.filter(
      (event) =>
        event.startDate === date ||
        event.endDate === date ||
        (event.startDate < date && event.endDate > date),
    );

    return !eventsOnDate.some((event) => {
      if (event.isAllDay) {
        return true;
      }

      const eventStart = event.startDate === date ? event.startTime : "00:00";
      const eventEnd = event.endDate === date ? event.endTime : "23:59";
      return this.timeRangesOverlap(start, end, eventStart, eventEnd);
    });
  }

  /** Finds an event by ID. */
  async getEventById(id: string): Promise<CalendarEvent | null> {
    return this.events.find((event) => event.id === id) || null;
  }

  private replaceEvents(events: CalendarEvent[]) {
    this.events = events;
    this.onEventsChange(events);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private timeRangesOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string,
  ): boolean {
    const startAMinutes = this.getTimeMinutes(startA);
    const endAMinutes = this.getTimeMinutes(endA);
    const startBMinutes = this.getTimeMinutes(startB);
    const endBMinutes = this.getTimeMinutes(endB);

    return !(endAMinutes <= startBMinutes || startAMinutes >= endBMinutes);
  }

  private getTimeMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }
}
