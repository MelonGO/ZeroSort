import type { Language } from "@/types";
import type { CalendarEvent, EventColor } from "./types";

export type AIMessageRole = "user" | "assistant" | "system";

export interface AIMessage {
  /** Unique message identifier. */
  id: string;
  /** Sender role for the assistant transcript. */
  role: AIMessageRole;
  /** Human-readable message content. */
  content: string;
  /** Time the message was added. */
  timestamp: Date;
  /** Suggested follow-up prompts. */
  suggestions?: string[];
  /** Concrete choices when the assistant needs clarification. */
  clarificationOptions?: string[];
}

export interface ParsedEventData {
  /** Event title. */
  title?: string;
  /** Event notes or details. */
  description?: string;
  /** Start date in YYYY-MM-DD format. */
  startDate?: string;
  /** End date in YYYY-MM-DD format. */
  endDate?: string;
  /** Start time in HH:mm format. */
  startTime?: string;
  /** End time in HH:mm format. */
  endTime?: string;
  /** Event color token. */
  color?: EventColor;
  /** Whether the event is all-day. */
  isAllDay?: boolean;
}

export interface EventFilters {
  /** Inclusive start date in YYYY-MM-DD format. */
  dateFrom?: string;
  /** Inclusive end date in YYYY-MM-DD format. */
  dateTo?: string;
  /** Colors to include. */
  colors?: EventColor[];
  /** Text to match against event title or description. */
  searchTerm?: string;
  /** Optional all-day filter. */
  isAllDay?: boolean;
}

export interface AIResponseMetadata {
  /** Optional assistant-authored message. */
  message?: string;
  /** Brief explanation of the model choice. */
  reasoningSummary?: string;
  /** Suggested follow-up prompts. */
  suggestions?: string[];
  /** Model confidence from 0 to 1. */
  confidence?: number;
  /** Concrete choices when clarification is required. */
  clarificationOptions?: string[];
}

export type LLMCalendarAction =
  | ({ type: "reply"; message: string } & AIResponseMetadata)
  | ({
      type: "clarify";
      message: string;
      options?: string[];
    } & AIResponseMetadata)
  | ({ type: "create"; eventData: ParsedEventData } & AIResponseMetadata)
  | ({ type: "query"; filters: EventFilters } & AIResponseMetadata)
  | ({
      type: "update";
      eventId: string;
      updates: Partial<CalendarEvent>;
    } & AIResponseMetadata)
  | ({
      type: "delete";
      eventIds: string[];
      requiresConfirmation: true;
    } & AIResponseMetadata);

export interface PendingCalendarAction {
  /** Pending confirmation identifier. */
  id: string;
  /** Original delete action. */
  action: Extract<LLMCalendarAction, { type: "delete" }>;
  /** Confirmation prompt. */
  message: string;
  /** Event IDs that will be deleted. */
  eventIds: string[];
  /** Event titles shown in the confirmation UI. */
  eventTitles: string[];
}

export interface TimeRange {
  /** Start time in HH:mm format. */
  start: string;
  /** End time in HH:mm format. */
  end: string;
  /** Date in YYYY-MM-DD format. */
  date: string;
}

export interface AICalendarAPI {
  /** Creates a calendar event. */
  createEvent(params: Partial<CalendarEvent>): Promise<CalendarEvent>;
  /** Updates a calendar event. */
  updateEvent(
    id: string,
    params: Partial<CalendarEvent>,
  ): Promise<CalendarEvent>;
  /** Deletes a calendar event. */
  deleteEvent(id: string): Promise<void>;
  /** Queries calendar events. */
  queryEvents(filters: EventFilters): Promise<CalendarEvent[]>;
  /** Checks whether a time range is free. */
  checkAvailability(timeRange: TimeRange): Promise<boolean>;
  /** Finds a calendar event by ID. */
  getEventById(id: string): Promise<CalendarEvent | null>;
}

export interface AIResponse {
  /** Whether the operation succeeded. */
  success: boolean;
  /** Assistant response shown to the user. */
  message: string;
  /** Optional operation payload. */
  data?: unknown;
  /** Whether the assistant needs more information. */
  needsClarification?: boolean;
  /** Concrete clarification choices. */
  clarificationOptions?: string[];
  /** Suggested follow-up prompts. */
  suggestions?: string[];
  /** Brief explanation of model reasoning. */
  reasoningSummary?: string;
  /** Model confidence from 0 to 1. */
  confidence?: number;
  /** Pending destructive action confirmation. */
  pendingConfirmation?: PendingCalendarAction;
}

export interface ConversationContext {
  /** Recent chat messages. */
  recentMessages: AIMessage[];
  /** Events recently referenced by query/update operations. */
  referencedEvents: CalendarEvent[];
  /** Assistant preferences and locale context. */
  userPreferences: {
    defaultDuration: number;
    defaultColor: EventColor;
    timezone: string;
    use24Hour: boolean;
    language?: Language;
    currentViewDate?: string;
  };
}
