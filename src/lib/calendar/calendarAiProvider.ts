import { getModelFromConfig } from "@/lib/ai/provider";
import type { ProviderConfig } from "@/types/model";
import { generateText, type LanguageModel } from "ai";
import type {
  AIMessage,
  ConversationContext,
  LLMCalendarAction,
  PendingCalendarAction,
} from "./aiTypes";
import { EVENT_COLOR_VALUES } from "./event-colors";
import type { CalendarEvent } from "./types";

export interface CalendarAIContext {
  userMessage: string;
  recentMessages: AIMessage[];
  referencedEvents: CalendarEvent[];
  events: CalendarEvent[];
  now: string;
  timezone: string;
  use24Hour: boolean;
  userPreferences: ConversationContext["userPreferences"];
  pendingConfirmation?: PendingCalendarAction;
}

export interface CalendarAIModelSelection {
  config: ProviderConfig | null;
  modelId: string | null;
}

export class CalendarAIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarAIProviderError";
  }
}

const colorList = EVENT_COLOR_VALUES.join("|");
const colorLabels = EVENT_COLOR_VALUES.join(", ");

/** Generates structured calendar actions with ZeroSort's configured AI model. */
export class CalendarAIProvider {
  private getSelection: () => CalendarAIModelSelection;

  constructor(getSelection: () => CalendarAIModelSelection) {
    this.getSelection = getSelection;
  }

  /** Returns whether a model is currently configured. */
  isConfigured(): boolean {
    const { config, modelId } = this.getSelection();
    return Boolean(config && modelId && config.apiKey !== undefined);
  }

  /** Requests one structured calendar action from the selected model. */
  async generateAction(context: CalendarAIContext): Promise<LLMCalendarAction> {
    const { config, modelId } = this.getSelection();

    if (!config || !modelId) {
      throw new CalendarAIProviderError(
        "No AI model is selected. Choose a model in settings to use the calendar assistant.",
      );
    }

    const model = await getModelFromConfig(config, modelId);
    const result = await generateText({
      model: model as LanguageModel,
      temperature: 0.25,
      prompt: this.createPrompt(context),
    });

    return this.parseAction(result.text);
  }

  private createPrompt(context: CalendarAIContext): string {
    const replyLanguage = context.userPreferences.language || "en";

    return [
      "You are an AI calendar assistant inside a local note-taking app.",
      "Return only one JSON object. Do not include markdown, prose, or code fences.",
      "Choose exactly one of these action shapes:",
      '{"type":"reply","message":"...","suggestions":["..."],"confidence":0.8}',
      '{"type":"clarify","message":"...","options":["..."],"clarificationOptions":["..."],"suggestions":["..."],"confidence":0.6}',
      `{"type":"create","eventData":{"title":"...","description":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","startTime":"HH:mm","endTime":"HH:mm","color":"${colorList}","isAllDay":false},"message":"...","suggestions":["..."],"confidence":0.9}`,
      '{"type":"query","filters":{"dateFrom":"YYYY-MM-DD","dateTo":"YYYY-MM-DD","colors":["blue"],"searchTerm":"..."},"message":"...","suggestions":["..."],"confidence":0.9}',
      `{"type":"update","eventId":"existing-event-id","updates":{"title":"...","description":"...","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","startTime":"HH:mm","endTime":"HH:mm","color":"${colorList}","isAllDay":false},"message":"...","suggestions":["..."],"confidence":0.9}`,
      '{"type":"delete","eventIds":["existing-event-id"],"requiresConfirmation":true,"message":"...","suggestions":["..."],"confidence":0.9}',
      "Use only event IDs from the provided events for update and delete actions.",
      "If the request is ambiguous or missing required details, return clarify with one clear question and 2-4 concrete options.",
      "For schedule/list/calendar queries, do not set filters.isAllDay unless the user explicitly asks for only all-day or only timed events.",
      "Use ISO dates and 24-hour HH:mm times in JSON regardless of display preference.",
      `Valid colors are ${colorLabels}. Omit color if the user did not ask for one.`,
      "If the user gives a start time but no end time, omit endTime and the app will apply the default duration.",
      "If the user includes notes, agenda, location, or extra context about an event, put that text in description.",
      `Write human-facing message, suggestion, and clarification text in this language: ${replyLanguage}.`,
      "Never claim an event changed unless the action actually changes it.",
      "Calendar context:",
      JSON.stringify({
        now: context.now,
        timezone: context.timezone,
        use24Hour: context.use24Hour,
        userPreferences: context.userPreferences,
        language: replyLanguage,
        currentViewDate: context.userPreferences.currentViewDate,
        events: context.events,
        referencedEvents: context.referencedEvents,
        pendingConfirmation: context.pendingConfirmation,
        recentMessages: context.recentMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        userMessage: context.userMessage,
      }),
    ].join("\n");
  }

  private parseAction(content: string): LLMCalendarAction {
    const trimmedContent = content.trim();
    const jsonText = trimmedContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      return JSON.parse(jsonText) as LLMCalendarAction;
    } catch {
      throw new CalendarAIProviderError(
        "The AI returned invalid calendar JSON.",
      );
    }
  }
}
