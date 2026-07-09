import i18n, { isSupportedLanguage } from "@/i18n";
import type { Language } from "@/types";
import type {
  AIMessage,
  AIResponse,
  ConversationContext,
  EventFilters,
  LLMCalendarAction,
  ParsedEventData,
  PendingCalendarAction,
} from "./aiTypes";
import { formatDate, formatTime } from "./calendar-utils";
import {
  CalendarAIProvider,
  CalendarAIProviderError,
} from "./calendarAiProvider";
import type { CalendarAPIService } from "./calendarApi";
import { EVENT_COLOR_VALUES } from "./event-colors";
import type { CalendarEvent, EventColor } from "./types";

const validColors: EventColor[] = EVENT_COLOR_VALUES;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Processes AI-backed calendar requests and applies safe calendar operations. */
export class AIService {
  private calendarAPI: CalendarAPIService;
  private context: ConversationContext;
  private messages: AIMessage[] = [];
  private provider: CalendarAIProvider;
  private pendingConfirmation?: PendingCalendarAction;

  constructor(
    calendarAPI: CalendarAPIService,
    provider: CalendarAIProvider,
    use24Hour: boolean = false,
  ) {
    this.calendarAPI = calendarAPI;
    this.provider = provider;
    this.context = {
      recentMessages: [],
      referencedEvents: [],
      userPreferences: {
        defaultDuration: 60,
        defaultColor: "blue",
        language: this.getLanguage(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        use24Hour,
      },
    };
  }

  /** Processes a user message and appends the assistant response. */
  async processMessage(userMessage: string): Promise<AIResponse> {
    this.addMessage("user", userMessage);

    if (!this.provider.isConfigured()) {
      return this.addAssistantResponse({
        success: false,
        message: this.translate("ai.noModelSelected"),
      });
    }

    try {
      const action = await this.provider.generateAction({
        userMessage,
        recentMessages: this.context.recentMessages,
        referencedEvents: this.context.referencedEvents,
        events: this.calendarAPI.getEvents(),
        now: new Date().toISOString(),
        timezone: this.context.userPreferences.timezone,
        use24Hour: this.context.userPreferences.use24Hour,
        userPreferences: this.context.userPreferences,
        pendingConfirmation: this.pendingConfirmation,
      });

      const response = await this.executeLLMAction(action);
      return this.addAssistantResponse(response);
    } catch (error) {
      const message =
        error instanceof CalendarAIProviderError
          ? this.translate("event-calendar.assistant.serviceUnavailable", {
              error: error.message,
            })
          : this.translate("event-calendar.assistant.processingFailed", {
              error:
                error instanceof Error
                  ? error.message
                  : this.translate("event-calendar.assistant.tryAgain"),
            });

      return this.addAssistantResponse({ success: false, message });
    }
  }

  /** Confirms the currently pending destructive action. */
  async confirmPendingAction(): Promise<AIResponse> {
    if (!this.pendingConfirmation) {
      return this.addAssistantResponse({
        success: false,
        message: this.translate("event-calendar.assistant.noPendingConfirm"),
      });
    }

    const pending = this.pendingConfirmation;
    this.pendingConfirmation = undefined;

    try {
      for (const eventId of pending.eventIds) {
        await this.calendarAPI.deleteEvent(eventId);
      }

      return this.addAssistantResponse({
        success: true,
        message: this.translate("event-calendar.assistant.deleteSuccess", {
          eventCount: this.translate("event-calendar.calendar.eventCount", {
            count: pending.eventIds.length,
          }),
        }),
        data: { deletedCount: pending.eventIds.length },
      });
    } catch (error) {
      return this.addAssistantResponse({
        success: false,
        message: this.translate("event-calendar.assistant.deleteFailed", {
          error:
            error instanceof Error
              ? error.message
              : this.translate("event-calendar.assistant.unknownError"),
        }),
      });
    }
  }

  /** Cancels the currently pending destructive action. */
  cancelPendingAction(): AIResponse {
    if (!this.pendingConfirmation) {
      return this.addAssistantResponse({
        success: false,
        message: this.translate("event-calendar.assistant.noPendingCancel"),
      });
    }

    this.pendingConfirmation = undefined;
    return this.addAssistantResponse({
      success: true,
      message: this.translate("event-calendar.assistant.deleteCanceled"),
    });
  }

  /** Returns a copy of the current transcript. */
  getMessages(): AIMessage[] {
    return [...this.messages];
  }

  /** Returns the currently pending confirmation. */
  getPendingConfirmation(): PendingCalendarAction | undefined {
    return this.pendingConfirmation;
  }

  /** Updates assistant preferences from the calendar UI. */
  updatePreferences(
    preferences: Partial<ConversationContext["userPreferences"]>,
  ) {
    this.context.userPreferences = {
      ...this.context.userPreferences,
      ...preferences,
    };
  }

  /** Clears transcript and transient AI context. */
  clearHistory() {
    this.messages = [];
    this.context.recentMessages = [];
    this.context.referencedEvents = [];
    this.pendingConfirmation = undefined;
  }

  private async executeLLMAction(
    action: LLMCalendarAction,
  ): Promise<AIResponse> {
    switch (action.type) {
      case "reply":
        return {
          success: true,
          message: this.requireMessage(action.message),
          ...this.getResponseMetadata(action),
        };
      case "clarify":
        return {
          success: false,
          message: this.requireMessage(action.message),
          needsClarification: true,
          clarificationOptions: this.validateOptions(
            action.clarificationOptions || action.options,
          ),
          ...this.getResponseMetadata(action),
        };
      case "create":
        return await this.handleCreate(action);
      case "query":
        return await this.handleQuery(action);
      case "update":
        return await this.handleUpdate(action);
      case "delete":
        return await this.handleDelete(action);
      default:
        return {
          success: false,
          message: this.translate("event-calendar.assistant.unsupportedAction"),
        };
    }
  }

  private async handleCreate(
    action: Extract<LLMCalendarAction, { type: "create" }>,
  ): Promise<AIResponse> {
    const eventData = this.applyEventDefaults(
      this.validateEventData(action.eventData),
    );

    if (!eventData.title) {
      return {
        success: false,
        message: this.translate("event-calendar.assistant.needsEventTitle"),
        needsClarification: true,
        clarificationOptions: [
          this.translate("event-calendar.assistant.suggestMeeting"),
          this.translate("event-calendar.assistant.suggestAppointment"),
          this.translate("event-calendar.assistant.suggestFocusTime"),
        ],
        ...this.getResponseMetadata(action),
      };
    }

    if (!eventData.startDate) {
      return {
        success: false,
        message: this.translate("event-calendar.assistant.needsEventDate"),
        needsClarification: true,
        clarificationOptions: this.getDateSuggestions(),
        ...this.getResponseMetadata(action),
      };
    }

    if (!eventData.isAllDay && !eventData.startTime) {
      return {
        success: false,
        message: this.translate("event-calendar.assistant.needsEventTime"),
        needsClarification: true,
        clarificationOptions: ["09:00", "12:00", "14:00"],
        ...this.getResponseMetadata(action),
      };
    }

    const createdEvent = await this.calendarAPI.createEvent(eventData);
    const conflicts = createdEvent.isAllDay
      ? []
      : this.findConflictingEvents(createdEvent);
    this.context.referencedEvents = [createdEvent];

    const message = this.withConflictWarning(
      this.formatCreatedMessage(createdEvent),
      conflicts,
    );

    return {
      success: true,
      message,
      data: createdEvent,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleQuery(
    action: Extract<LLMCalendarAction, { type: "query" }>,
  ): Promise<AIResponse> {
    const filters = this.validateFilters(action.filters);
    const events = await this.calendarAPI.queryEvents(filters);
    this.context.referencedEvents = events.slice(0, 8);

    return {
      success: true,
      message: this.formatQueryMessage(events, filters),
      data: events,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleUpdate(
    action: Extract<LLMCalendarAction, { type: "update" }>,
  ): Promise<AIResponse> {
    if (!action.eventId) {
      return {
        success: false,
        message: this.translate(
          "event-calendar.assistant.needsEventReferenceUpdate",
        ),
        needsClarification: true,
        clarificationOptions: this.context.referencedEvents
          .slice(0, 4)
          .map((event) => this.formatEventSummary(event)),
        ...this.getResponseMetadata(action),
      };
    }

    const existingEvent = await this.calendarAPI.getEventById(action.eventId);
    if (!existingEvent) {
      return {
        success: false,
        message: this.translate("event-calendar.assistant.eventNotFoundUpdate"),
        needsClarification: true,
        ...this.getResponseMetadata(action),
      };
    }

    const updates = this.validateEventData(action.updates);
    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        message: this.translate("event-calendar.assistant.needsUpdateChange"),
        needsClarification: true,
        clarificationOptions: [
          this.translate("event-calendar.assistant.suggestMoveTomorrow"),
          this.translate("event-calendar.assistant.suggestRename"),
          this.translate("event-calendar.assistant.suggestChangeColor"),
        ],
        ...this.getResponseMetadata(action),
      };
    }

    const updatedEvent = await this.calendarAPI.updateEvent(
      action.eventId,
      this.completeUpdateTimes(existingEvent, updates),
    );
    this.context.referencedEvents = [updatedEvent];

    return {
      success: true,
      message: this.translate("event-calendar.assistant.updatedEvent", {
        title: updatedEvent.title,
        changes: this.formatUpdateChanges(updates),
      }),
      data: updatedEvent,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleDelete(
    action: Extract<LLMCalendarAction, { type: "delete" }>,
  ): Promise<AIResponse> {
    const eventIds = Array.from(new Set(action.eventIds || []));
    const events = (
      await Promise.all(eventIds.map((id) => this.calendarAPI.getEventById(id)))
    ).filter((event): event is CalendarEvent => Boolean(event));

    if (events.length === 0) {
      return {
        success: false,
        message: this.translate("event-calendar.assistant.eventNotFoundDelete"),
        needsClarification: true,
        clarificationOptions: this.context.referencedEvents
          .slice(0, 4)
          .map((event) => this.formatEventSummary(event)),
        ...this.getResponseMetadata(action),
      };
    }

    this.pendingConfirmation = {
      id: `${Date.now()}`,
      action,
      message: this.formatDeleteConfirmation(events),
      eventIds: events.map((event) => event.id),
      eventTitles: events.map((event) => this.formatEventSummary(event)),
    };

    return {
      success: false,
      message: this.pendingConfirmation.message,
      pendingConfirmation: this.pendingConfirmation,
      ...this.getResponseMetadata(action),
    };
  }

  private validateEventData(data: Partial<CalendarEvent> | ParsedEventData) {
    const result: Partial<CalendarEvent> = {};

    if (typeof data.title === "string" && data.title.trim()) {
      result.title = data.title.trim();
    }

    if (typeof data.description === "string") {
      result.description = data.description.trim();
    }

    if (this.isDate(data.startDate)) {
      result.startDate = data.startDate;
    }

    if (this.isDate(data.endDate)) {
      result.endDate = data.endDate;
    }

    if (this.isTime(data.startTime)) {
      result.startTime = data.startTime;
    }

    if (this.isTime(data.endTime)) {
      result.endTime = data.endTime;
    }

    if (data.color && validColors.includes(data.color)) {
      result.color = data.color;
    }

    if (typeof data.isAllDay === "boolean") {
      result.isAllDay = data.isAllDay;
    }

    return result;
  }

  private validateFilters(filters: EventFilters): EventFilters {
    return {
      dateFrom: this.isDate(filters.dateFrom) ? filters.dateFrom : undefined,
      dateTo: this.isDate(filters.dateTo) ? filters.dateTo : undefined,
      colors: filters.colors?.filter((color) => validColors.includes(color)),
      searchTerm:
        typeof filters.searchTerm === "string" && filters.searchTerm.trim()
          ? filters.searchTerm.trim()
          : undefined,
      isAllDay:
        typeof filters.isAllDay === "boolean" ? filters.isAllDay : undefined,
    };
  }

  private applyEventDefaults(
    eventData: Partial<CalendarEvent>,
  ): Partial<CalendarEvent> {
    const startDate = eventData.startDate;
    const startTime = eventData.startTime;
    const endTime =
      eventData.endTime ||
      (startTime
        ? this.addMinutes(
            startTime,
            this.context.userPreferences.defaultDuration,
          )
        : undefined);

    return {
      ...eventData,
      description: eventData.description || "",
      endDate: eventData.endDate || startDate,
      startTime: eventData.isAllDay ? "00:00" : startTime,
      endTime: eventData.isAllDay ? "23:59" : endTime,
      color: eventData.color || this.context.userPreferences.defaultColor,
    };
  }

  private completeUpdateTimes(
    existingEvent: CalendarEvent,
    updates: Partial<CalendarEvent>,
  ): Partial<CalendarEvent> {
    if (updates.isAllDay) {
      return { ...updates, startTime: "00:00", endTime: "23:59" };
    }

    if (updates.startTime && !updates.endTime) {
      return {
        ...updates,
        endTime: this.addMinutes(
          updates.startTime,
          this.context.userPreferences.defaultDuration,
        ),
      };
    }

    if (updates.startDate && !updates.endDate) {
      return { ...updates, endDate: updates.startDate };
    }

    if (updates.isAllDay === false && existingEvent.isAllDay) {
      return {
        startTime: "09:00",
        endTime: "10:00",
        ...updates,
      };
    }

    return updates;
  }

  private formatCreatedMessage(event: CalendarEvent): string {
    if (event.startDate !== event.endDate) {
      return this.translate("event-calendar.assistant.createdEventFromTo", {
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
      });
    }

    if (event.isAllDay) {
      return this.translate("event-calendar.assistant.createdEventOnAllDay", {
        title: event.title,
        date: event.startDate,
        allDay: this.translate("event-calendar.assistant.allDay"),
      });
    }

    return this.translate("event-calendar.assistant.createdEventOnAtTime", {
      title: event.title,
      date: event.startDate,
      time: formatTime(event.startTime, this.context.userPreferences.use24Hour),
    });
  }

  private formatQueryMessage(events: CalendarEvent[], filters: EventFilters) {
    if (events.length === 0) {
      return this.formatEmptyResults(filters);
    }

    const count = this.translate("event-calendar.calendar.eventCount", {
      count: events.length,
    });
    const prefix = filters.dateFrom
      ? filters.dateTo && filters.dateTo !== filters.dateFrom
        ? this.translate("event-calendar.assistant.queryFoundFromTo", {
            eventCount: count,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          })
        : this.translate("event-calendar.assistant.queryFoundOnDate", {
            eventCount: count,
            date: filters.dateFrom,
          })
      : filters.dateTo
        ? this.translate("event-calendar.assistant.queryFoundThrough", {
            eventCount: count,
            date: filters.dateTo,
          })
        : this.translate("event-calendar.assistant.queryFoundAny", {
            eventCount: count,
          });

    return `${prefix}:\n${events
      .slice(0, 8)
      .map((event) => `- ${this.formatEventSummary(event)}`)
      .join("\n")}`;
  }

  private formatEmptyResults(filters: EventFilters): string {
    if (filters.searchTerm && filters.dateFrom && filters.dateTo) {
      return this.translate(
        "event-calendar.assistant.emptyResultsFromToMatching",
        {
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          searchTerm: filters.searchTerm,
        },
      );
    }

    if (filters.searchTerm && filters.dateFrom) {
      return this.translate(
        "event-calendar.assistant.emptyResultsOnDateMatching",
        {
          date: filters.dateFrom,
          searchTerm: filters.searchTerm,
        },
      );
    }

    if (filters.searchTerm) {
      return this.translate("event-calendar.assistant.emptyResultsMatching", {
        searchTerm: filters.searchTerm,
      });
    }

    if (
      filters.dateFrom &&
      filters.dateTo &&
      filters.dateFrom !== filters.dateTo
    ) {
      return this.translate("event-calendar.assistant.emptyResultsFromTo", {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });
    }

    if (filters.dateFrom) {
      return this.translate("event-calendar.assistant.emptyResultsOnDate", {
        date: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      return this.translate("event-calendar.assistant.emptyResultsThrough", {
        date: filters.dateTo,
      });
    }

    return this.translate("event-calendar.assistant.emptyResultsForSearch");
  }

  private formatUpdateChanges(updates: Partial<CalendarEvent>): string {
    const changes: string[] = [];

    if (updates.title) {
      changes.push(
        this.translate("event-calendar.assistant.changeRenamed", {
          title: updates.title,
        }),
      );
    }

    if (updates.description !== undefined) {
      changes.push(
        this.translate(
          updates.description
            ? "event-calendar.assistant.changeDescriptionUpdated"
            : "event-calendar.assistant.changeDescriptionCleared",
        ),
      );
    }

    if (updates.startDate || updates.startTime) {
      changes.push(
        this.translate("event-calendar.assistant.changeRescheduled", {
          date: updates.startDate || "",
          time: updates.startTime
            ? formatTime(
                updates.startTime,
                this.context.userPreferences.use24Hour,
              )
            : "",
        }),
      );
    }

    if (updates.color) {
      changes.push(
        this.translate("event-calendar.assistant.changeColor", {
          color: this.translate(`event-calendar.colors.${updates.color}`),
        }),
      );
    }

    if (updates.isAllDay !== undefined) {
      changes.push(
        this.translate(
          updates.isAllDay
            ? "event-calendar.assistant.changeMarkedAllDay"
            : "event-calendar.assistant.changeMarkedTimed",
        ),
      );
    }

    return changes.join(", ") || "updated";
  }

  private formatDeleteConfirmation(events: CalendarEvent[]): string {
    if (events.length === 1) {
      return this.translate("event-calendar.assistant.confirmDeleteSingle", {
        title: events[0].title,
        date: events[0].startDate,
      });
    }

    return this.translate("event-calendar.assistant.confirmDeleteMultiple", {
      eventCount: this.translate("event-calendar.calendar.eventCount", {
        count: events.length,
      }),
    });
  }

  private formatEventSummary(event: CalendarEvent): string {
    return this.translate("event-calendar.assistant.eventOnDate", {
      title: event.title,
      date: event.startDate,
    });
  }

  private withConflictWarning(
    message: string,
    conflicts: CalendarEvent[],
  ): string {
    if (conflicts.length === 0) {
      return message;
    }

    const eventNames = conflicts
      .slice(0, 2)
      .map((event) => `"${event.title}"`)
      .join(", ");
    const extraInfo =
      conflicts.length > 2
        ? this.translate("event-calendar.assistant.conflictWarningExtra", {
            count: conflicts.length - 2,
          })
        : "";

    return this.translate("event-calendar.assistant.conflictWarning", {
      message,
      eventNames,
      extraInfo,
    });
  }

  private findConflictingEvents(event: CalendarEvent): CalendarEvent[] {
    return this.calendarAPI.getEvents().filter((candidate) => {
      if (candidate.id === event.id || candidate.isAllDay) {
        return false;
      }

      if (
        candidate.startDate > event.endDate ||
        candidate.endDate < event.startDate
      ) {
        return false;
      }

      return this.timeRangesOverlap(
        event.startTime,
        event.endTime,
        candidate.startTime,
        candidate.endTime,
      );
    });
  }

  private getResponseMetadata(action: LLMCalendarAction) {
    return {
      reasoningSummary: action.reasoningSummary,
      suggestions: this.validateOptions(action.suggestions),
      confidence: action.confidence,
    };
  }

  private addMessage(
    role: AIMessage["role"],
    content: string,
    metadata: Pick<AIMessage, "suggestions" | "clarificationOptions"> = {},
  ) {
    const message: AIMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      ...metadata,
    };

    this.messages = [...this.messages, message];
    this.context.recentMessages = this.messages.slice(-8);
  }

  private addAssistantResponse(response: AIResponse): AIResponse {
    this.addMessage("assistant", response.message, {
      suggestions: response.suggestions,
      clarificationOptions: response.clarificationOptions,
    });
    return response;
  }

  private getLanguage(): Language | undefined {
    const language = i18n.resolvedLanguage || i18n.language;
    return isSupportedLanguage(language) ? language : undefined;
  }

  private translate(key: string, options?: Record<string, unknown> | string) {
    if (typeof options === "string") {
      return i18n.t(key, options);
    }

    return i18n.t(key, options);
  }

  private requireMessage(message?: string): string {
    return (
      message?.trim() ||
      this.translate("event-calendar.assistant.defaultPrompt")
    );
  }

  private validateOptions(options?: string[]): string[] | undefined {
    const validOptions = options?.filter(
      (option) => typeof option === "string" && option.trim().length > 0,
    );

    return validOptions?.length ? validOptions.slice(0, 4) : undefined;
  }

  private getDateSuggestions(): string[] {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return [
      formatDate(today),
      formatDate(tomorrow),
      this.translate("event-calendar.assistant.suggestShowWeek"),
    ];
  }

  private isDate(value: unknown): value is string {
    return typeof value === "string" && datePattern.test(value);
  }

  private isTime(value: unknown): value is string {
    return typeof value === "string" && timePattern.test(value);
  }

  private addMinutes(time: string, minutes: number): string {
    const [hours, currentMinutes] = time.split(":").map(Number);
    const totalMinutes = Math.min(
      hours * 60 + currentMinutes + minutes,
      23 * 60 + 59,
    );
    const nextHours = Math.floor(totalMinutes / 60);
    const nextMinutes = totalMinutes % 60;
    return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
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
