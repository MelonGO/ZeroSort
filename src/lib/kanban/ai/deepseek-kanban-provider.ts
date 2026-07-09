import i18n from "@/i18n";
import type {
  KanbanProviderContext,
  LLMKanbanAction,
} from "@/lib/kanban/ai/kanban-ai.types";
import {
  columnColors,
  priorityOptions,
} from "@/lib/kanban/kanban-board.shared";

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChoice = {
  message?: {
    content?: string;
  };
};

type DeepSeekResponse = {
  choices?: DeepSeekChoice[];
  error?: {
    message?: string;
  };
};

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export class DeepSeekKanbanProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekKanbanProviderError";
  }
}

export class DeepSeekKanbanProvider {
  private apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY?.trim();
  private model =
    import.meta.env.VITE_DEEPSEEK_MODEL?.trim() || "deepseek-chat";

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async generateAction(
    context: KanbanProviderContext,
  ): Promise<LLMKanbanAction> {
    if (!this.apiKey) {
      throw new DeepSeekKanbanProviderError(
        i18n.t("kanban.aiService.notConfigured"),
      );
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: this.createMessages(context),
      }),
    });

    const payload = (await response
      .json()
      .catch(() => null)) as DeepSeekResponse | null;

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        i18n.t("kanban.aiService.providerRequestFailed", {
          status: response.status,
        });
      throw new DeepSeekKanbanProviderError(message);
    }

    const content = payload?.choices?.[0]?.message?.content;

    if (!content) {
      throw new DeepSeekKanbanProviderError(
        i18n.t("kanban.aiService.providerEmptyResponse"),
      );
    }

    return this.parseAction(content);
  }

  private createMessages(context: KanbanProviderContext): DeepSeekMessage[] {
    return [
      {
        role: "system",
        content: [
          "You are an AI kanban assistant for a local browser kanban board.",
          "Your job has two separate parts:",
          "1. Choose the safest structured kanban action from the allowed action shapes.",
          "2. Write a brief, warm, specific human-facing message for that action.",
          "Return only one JSON object. Do not include markdown, prose, or code fences.",
          "Allowed action shapes:",
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
          "Response style: sound natural but not chatty, avoid fake certainty, and never claim an item changed unless the action changes it.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          now: context.now,
          timezone: context.timezone,
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
      },
    ];
  }

  private parseAction(content: string): LLMKanbanAction {
    try {
      return JSON.parse(content) as LLMKanbanAction;
    } catch {
      throw new DeepSeekKanbanProviderError(
        i18n.t("kanban.aiService.providerInvalidJson"),
      );
    }
  }
}
