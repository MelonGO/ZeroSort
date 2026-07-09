import i18n from "@/i18n";
import { getModelFromConfig } from "@/lib/ai/provider";
import type {
  KanbanProviderContext,
  LLMKanbanAction,
} from "@/lib/kanban/ai/kanban-ai.types";
import {
  columnColors,
  priorityOptions,
} from "@/lib/kanban/kanban-board.shared";
import type { ProviderConfig } from "@/types/model";
import { generateText, type LanguageModel } from "ai";

export interface KanbanAIModelSelection {
  config: ProviderConfig | null;
  modelId: string | null;
}

export class KanbanAIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KanbanAIProviderError";
  }
}

export class KanbanAIProvider {
  private getSelection: () => KanbanAIModelSelection;

  constructor(getSelection: () => KanbanAIModelSelection) {
    this.getSelection = getSelection;
  }

  isConfigured(): boolean {
    const { config, modelId } = this.getSelection();
    return Boolean(config && modelId && config.apiKey !== undefined);
  }

  async generateAction(
    context: KanbanProviderContext,
  ): Promise<LLMKanbanAction> {
    const { config, modelId } = this.getSelection();

    if (!config || !modelId) {
      throw new KanbanAIProviderError(
        "No AI model is selected. Choose a model in settings to use the kanban assistant.",
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

  private createPrompt(context: KanbanProviderContext): string {
    const replyLanguage = i18n.resolvedLanguage || i18n.language || "en";

    return [
      "You are an AI kanban assistant inside a local note-taking app.",
      "Return only one JSON object. Do not include markdown, prose, or code fences.",
      "Choose exactly one of these action shapes:",
      '{"type":"reply","message":"...","suggestions":["..."],"confidence":0.8}',
      '{"type":"clarify","message":"...","options":["..."],"clarificationOptions":["..."],"suggestions":["..."],"confidence":0.6}',
      '{"type":"create_card","cardData":{"title":"...","description":"...","priority":"medium","assignee":"...","dueDate":"...","tags":["..."],"columnId":"existing-column-id"},"message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"create_column","columnData":{"title":"...","description":"...","color":"#64748b"},"message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"query","filters":{"type":"card","searchTerm":"...","columnId":"existing-column-id","priority":"high","assignee":"...","dueDate":"...","tags":["..."]},"message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"update_card","cardId":"existing-card-id","updates":{"title":"...","description":"...","priority":"high","assignee":"...","dueDate":"...","tags":["..."],"columnId":"existing-column-id"},"message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"update_column","columnId":"existing-column-id","updates":{"title":"...","description":"...","color":"#2563eb"},"message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"move_card","cardId":"existing-card-id","toColumnId":"existing-column-id","targetCardId":"existing-card-id-or-null","edge":"top|bottom|end","message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"move_column","columnId":"existing-column-id","targetColumnId":"existing-column-id-or-null","edge":"left|right|end","message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"delete_card","cardIds":["existing-card-id"],"requiresConfirmation":true,"message":"...","suggestions":["..."],"confidence":0.9}',
      '{"type":"delete_column","columnIds":["existing-column-id"],"requiresConfirmation":true,"message":"...","suggestions":["..."],"confidence":0.9}',
      "Optional response metadata: reasoningSummary, suggestions, confidence, clarificationOptions.",
      "Use only card IDs and column IDs from the provided board snapshot for update, move, and delete actions.",
      "If the requested card or column is ambiguous, return clarify with one clear question and 2-4 concrete options.",
      "If create_card omits columnId, choose the best matching existing column from the user's wording; if unclear, clarify.",
      `Valid priorities are ${priorityOptions.join(", ")}.`,
      `Valid column colors are ${columnColors.join(", ")}.`,
      "Delete actions must always set requiresConfirmation to true.",
      "For query requests, do not invent IDs or raw JSON details. The app will format results.",
      `Write human-facing message, suggestion, and clarification text in this language: ${replyLanguage}.`,
      "Never claim an item changed unless the action actually changes it.",
      "Kanban context:",
      JSON.stringify({
        now: context.now,
        timezone: context.timezone,
        language: replyLanguage,
        columns: context.columns,
        cards: context.cards,
        referencedItems: context.referencedItems,
        pendingConfirmation: context.pendingConfirmation,
        recentMessages: context.recentMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        userMessage: context.userMessage,
      }),
    ].join("\n");
  }

  private parseAction(content: string): LLMKanbanAction {
    const trimmedContent = content.trim();
    const jsonText = trimmedContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      return JSON.parse(jsonText) as LLMKanbanAction;
    } catch {
      throw new KanbanAIProviderError("The AI returned invalid kanban JSON.");
    }
  }
}
