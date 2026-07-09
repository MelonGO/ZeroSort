import i18n from "@/i18n";
import {
  KanbanAIProvider,
  KanbanAIProviderError,
} from "@/lib/kanban/ai/kanban-ai-provider";
import type {
  AIMessage,
  AIResponse,
  BoardQueryFilters,
  BoardReference,
  ConversationContext,
  LLMKanbanAction,
  ParsedCardData,
  ParsedColumnData,
  PendingKanbanAction,
} from "@/lib/kanban/ai/kanban-ai.types";
import type { KanbanAPIService } from "@/lib/kanban/ai/kanban-api-service";
import {
  columnColors,
  priorityLabelKeys,
  priorityOptions,
} from "@/lib/kanban/kanban-board.shared";
import type {
  FlatBoardCard,
  FlatBoardColumn,
} from "@/lib/kanban/kanban-board.utils";
import { createDefaultCardContent } from "@/lib/kanban/kanban-board.utils";
import type { CardContent, ColumnContent, Priority } from "@/lib/kanban/types";

export class KanbanAIService {
  private api: KanbanAPIService;
  private context: ConversationContext;
  private messages: AIMessage[] = [];
  private provider: KanbanAIProvider;
  private pendingConfirmation?: PendingKanbanAction;

  constructor(api: KanbanAPIService, provider: KanbanAIProvider) {
    this.api = api;
    this.provider = provider;
    this.context = {
      recentMessages: [],
      referencedItems: [],
      userPreferences: {},
    };
  }

  async processMessage(userMessage: string): Promise<AIResponse> {
    this.addMessage("user", userMessage);

    const localQueryAction = this.getLocalQueryAction(userMessage);

    if (localQueryAction) {
      return this.addAssistantResponse(
        await this.executeAction(localQueryAction),
      );
    }

    if (!this.provider.isConfigured()) {
      return this.addAssistantResponse({
        success: false,
        message: i18n.t("ai.noModelSelected"),
      });
    }

    try {
      const snapshot = this.api.getSnapshot();
      const action = await this.provider.generateAction({
        userMessage,
        recentMessages: this.context.recentMessages,
        referencedItems: this.context.referencedItems,
        board: this.api.getBoard(),
        columns: snapshot.columns,
        cards: snapshot.cards,
        now: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        pendingConfirmation: this.pendingConfirmation,
      });

      return this.addAssistantResponse(await this.executeAction(action));
    } catch (error) {
      const message =
        error instanceof KanbanAIProviderError
          ? this.t("aiService.providerUnavailable", { message: error.message })
          : this.t("aiService.processingFailed", {
              message:
                error instanceof Error
                  ? error.message
                  : this.t("aiService.tryAgain"),
            });

      return this.addAssistantResponse({
        success: false,
        message,
      });
    }
  }

  async confirmPendingAction(): Promise<AIResponse> {
    const pending = this.pendingConfirmation;

    if (!pending) {
      return this.addAssistantResponse({
        success: false,
        message: this.t("aiService.noPendingConfirm"),
      });
    }

    this.pendingConfirmation = undefined;

    if (pending.kind === "delete_card") {
      let deletedCount = 0;

      for (const cardId of pending.cardIds) {
        if (await this.api.deleteCardById(cardId)) {
          deletedCount += 1;
        }
      }

      return this.addAssistantResponse({
        success: true,
        message: this.t("aiService.deleted", {
          items: this.getItemCountLabel("card", deletedCount),
        }),
        data: { deletedCount },
      });
    }

    let deletedCount = 0;

    for (const columnId of pending.columnIds) {
      if (await this.api.deleteColumnById(columnId)) {
        deletedCount += 1;
      }
    }

    return this.addAssistantResponse({
      success: true,
      message: this.t("aiService.deletedColumnsAndCards", {
        columns: this.getItemCountLabel("column", deletedCount),
        cards: this.getItemCountLabel("card", pending.affectedCardCount),
      }),
      data: { deletedCount, affectedCardCount: pending.affectedCardCount },
    });
  }

  cancelPendingAction(): AIResponse {
    if (!this.pendingConfirmation) {
      return this.addAssistantResponse({
        success: false,
        message: this.t("aiService.noPendingCancel"),
      });
    }

    this.pendingConfirmation = undefined;

    return this.addAssistantResponse({
      success: true,
      message: this.t("aiService.canceledDeletion"),
    });
  }

  getMessages(): AIMessage[] {
    return [...this.messages];
  }

  getPendingConfirmation(): PendingKanbanAction | undefined {
    return this.pendingConfirmation;
  }

  clearHistory() {
    this.messages = [];
    this.context.recentMessages = [];
    this.context.referencedItems = [];
    this.pendingConfirmation = undefined;
  }

  private async executeAction(action: LLMKanbanAction): Promise<AIResponse> {
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
      case "create_card":
        return this.handleCreateCard(action);
      case "create_column":
        return this.handleCreateColumn(action);
      case "query":
        return this.handleQuery(action);
      case "update_card":
        return this.handleUpdateCard(action);
      case "update_column":
        return this.handleUpdateColumn(action);
      case "move_card":
        return this.handleMoveCard(action);
      case "move_column":
        return this.handleMoveColumn(action);
      case "delete_card":
        return this.handleDeleteCard(action);
      case "delete_column":
        return this.handleDeleteColumn(action);
      default:
        return {
          success: false,
          message: this.t("aiService.unsupportedAction"),
        };
    }
  }

  private async handleCreateCard(
    action: Extract<LLMKanbanAction, { type: "create_card" }>,
  ): Promise<AIResponse> {
    const cardData = this.validateCardData(action.cardData);

    if (!cardData.title) {
      return this.clarify(
        action,
        this.t("aiService.createCard.missingTitle"),
        this.getTranslatedOptions([
          "aiService.createCard.examples.launchChecklist",
          "aiService.createCard.examples.followUpWithDesign",
          "aiService.createCard.examples.reviewOpenBugs",
        ]),
      );
    }

    if (!cardData.columnId || !this.api.getColumn(cardData.columnId)) {
      return this.clarify(
        action,
        this.t("aiService.createCard.missingColumn"),
        this.getColumnOptions(),
      );
    }

    const card = await this.api.createCard({
      title: cardData.title,
      columnId: cardData.columnId,
      content: this.applyCardDefaults(cardData),
    });

    if (!card) {
      return {
        success: false,
        message: this.t("aiService.createCard.failed"),
        ...this.getResponseMetadata(action),
      };
    }

    this.context.referencedItems = [{ type: "card", ...card }];

    return {
      success: true,
      message:
        action.message ||
        this.t("aiService.createCard.success", {
          title: card.title,
          columnTitle: card.columnTitle,
        }),
      data: card,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleCreateColumn(
    action: Extract<LLMKanbanAction, { type: "create_column" }>,
  ): Promise<AIResponse> {
    const columnData = this.validateColumnData(action.columnData);

    if (!columnData.title) {
      return this.clarify(
        action,
        this.t("aiService.createColumn.missingTitle"),
        this.getTranslatedOptions([
          "aiService.createColumn.examples.backlog",
          "aiService.createColumn.examples.inProgress",
          "aiService.createColumn.examples.readyForReview",
        ]),
      );
    }

    const column = await this.api.createColumn({
      title: columnData.title,
      content: this.applyColumnDefaults(columnData),
    });

    if (!column) {
      return {
        success: false,
        message: this.t("aiService.createColumn.failed"),
        ...this.getResponseMetadata(action),
      };
    }

    this.context.referencedItems = [{ type: "column", ...column }];

    return {
      success: true,
      message:
        action.message ||
        this.t("aiService.createColumn.success", { title: column.title }),
      data: column,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleQuery(
    action: Extract<LLMKanbanAction, { type: "query" }>,
  ): Promise<AIResponse> {
    const filters = this.validateFilters(action.filters);
    const results = await this.api.query(filters);

    this.context.referencedItems = [
      ...results.columns.map(
        (column): BoardReference => ({ type: "column", ...column }),
      ),
      ...results.cards.map(
        (card): BoardReference => ({ type: "card", ...card }),
      ),
    ].slice(0, 12);

    return {
      success: true,
      message: this.formatQueryResults(results.columns, results.cards, filters),
      data: results,
      suggestions:
        this.validateOptions(action.suggestions) ||
        this.getTranslatedOptions([
          "aiService.query.suggestions.highPriority",
          "aiService.query.suggestions.assignedToMe",
        ]),
      ...this.getResponseMetadata(action),
    };
  }

  private async handleUpdateCard(
    action: Extract<LLMKanbanAction, { type: "update_card" }>,
  ): Promise<AIResponse> {
    const existingCard = this.api.getCard(action.cardId);

    if (!existingCard) {
      return this.clarify(
        action,
        this.t("aiService.updateCard.missingCard"),
        this.getCardOptions(),
      );
    }

    const updates = this.validateCardData(action.updates);
    const contentUpdates = this.getCardContentUpdates(updates);

    if (
      !updates.title &&
      Object.keys(contentUpdates).length === 0 &&
      !updates.columnId
    ) {
      return this.clarify(
        action,
        this.t("aiService.updateCard.missingChanges"),
        this.getTranslatedOptions([
          "aiService.updateCard.examples.rename",
          "aiService.updateCard.examples.changePriority",
          "aiService.updateCard.examples.assignToSomeone",
        ]),
      );
    }

    const updatedCard = await this.api.updateCard(action.cardId, {
      title: updates.title,
      content: contentUpdates,
    });

    if (
      updates.columnId &&
      updatedCard &&
      updates.columnId !== updatedCard.columnId
    ) {
      await this.api.moveCard(action.cardId, updates.columnId);
    }

    const finalCard = this.api.getCard(action.cardId);

    if (!finalCard) {
      return {
        success: false,
        message: this.t("aiService.updateCard.missingAfterUpdate"),
        ...this.getResponseMetadata(action),
      };
    }

    this.context.referencedItems = [{ type: "card", ...finalCard }];

    return {
      success: true,
      message:
        action.message ||
        this.t("aiService.updateCard.success", { title: finalCard.title }),
      data: finalCard,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleUpdateColumn(
    action: Extract<LLMKanbanAction, { type: "update_column" }>,
  ): Promise<AIResponse> {
    const existingColumn = this.api.getColumn(action.columnId);

    if (!existingColumn) {
      return this.clarify(
        action,
        this.t("aiService.updateColumn.missingColumn"),
        this.getColumnOptions(),
      );
    }

    const updates = this.validateColumnData(action.updates);
    const contentUpdates = this.getColumnContentUpdates(updates);

    if (!updates.title && Object.keys(contentUpdates).length === 0) {
      return this.clarify(
        action,
        this.t("aiService.updateColumn.missingChanges"),
        this.getTranslatedOptions([
          "aiService.updateColumn.examples.rename",
          "aiService.updateColumn.examples.changeColor",
          "aiService.updateColumn.examples.updateDescription",
        ]),
      );
    }

    const column = await this.api.updateColumn(action.columnId, {
      title: updates.title,
      content: contentUpdates,
    });

    if (!column) {
      return {
        success: false,
        message: this.t("aiService.updateColumn.missingAfterUpdate"),
        ...this.getResponseMetadata(action),
      };
    }

    this.context.referencedItems = [{ type: "column", ...column }];

    return {
      success: true,
      message:
        action.message ||
        this.t("aiService.updateColumn.success", { title: column.title }),
      data: column,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleMoveCard(
    action: Extract<LLMKanbanAction, { type: "move_card" }>,
  ): Promise<AIResponse> {
    if (!this.api.getCard(action.cardId)) {
      return this.clarify(
        action,
        this.t("aiService.moveCard.missingCard"),
        this.getCardOptions(),
      );
    }

    if (!this.api.getColumn(action.toColumnId)) {
      return this.clarify(
        action,
        this.t("aiService.moveCard.missingColumn"),
        this.getColumnOptions(),
      );
    }

    const card = await this.api.moveCard(
      action.cardId,
      action.toColumnId,
      action.targetCardId,
      this.validateCardMoveEdge(action.edge),
    );

    if (!card) {
      return {
        success: false,
        message: this.t("aiService.moveCard.failed"),
        ...this.getResponseMetadata(action),
      };
    }

    this.context.referencedItems = [{ type: "card", ...card }];

    return {
      success: true,
      message:
        action.message ||
        this.t("aiService.moveCard.success", {
          title: card.title,
          columnTitle: card.columnTitle,
        }),
      data: card,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleMoveColumn(
    action: Extract<LLMKanbanAction, { type: "move_column" }>,
  ): Promise<AIResponse> {
    if (!this.api.getColumn(action.columnId)) {
      return this.clarify(
        action,
        this.t("aiService.moveColumn.missingColumn"),
        this.getColumnOptions(),
      );
    }

    const column = await this.api.moveColumn(
      action.columnId,
      action.targetColumnId,
      this.validateColumnMoveEdge(action.edge),
      action.targetIndex,
    );

    if (!column) {
      return {
        success: false,
        message: this.t("aiService.moveColumn.failed"),
        ...this.getResponseMetadata(action),
      };
    }

    this.context.referencedItems = [{ type: "column", ...column }];

    return {
      success: true,
      message:
        action.message ||
        this.t("aiService.moveColumn.success", { title: column.title }),
      data: column,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleDeleteCard(
    action: Extract<LLMKanbanAction, { type: "delete_card" }>,
  ): Promise<AIResponse> {
    const cards = this.getExistingCards(action.cardIds);

    if (!action.requiresConfirmation || cards.length === 0) {
      return this.clarify(
        action,
        this.t("aiService.deleteCard.missingCard"),
        this.getCardOptions(),
      );
    }

    this.pendingConfirmation = {
      id: this.generateMessageId(),
      kind: "delete_card",
      message:
        action.message ||
        this.t("aiService.confirmDelete", {
          items: this.getItemCountLabel("card", cards.length),
        }),
      cardIds: cards.map((card) => card.id),
      itemTitles: cards.map((card) => card.title),
    };
    this.context.referencedItems = cards.map((card) => ({
      type: "card",
      ...card,
    }));

    return {
      success: false,
      message: this.pendingConfirmation.message,
      needsClarification: true,
      clarificationOptions: cards.map(
        (card) => `${card.title} in ${card.columnTitle}`,
      ),
      pendingConfirmation: this.pendingConfirmation,
      ...this.getResponseMetadata(action),
    };
  }

  private async handleDeleteColumn(
    action: Extract<LLMKanbanAction, { type: "delete_column" }>,
  ): Promise<AIResponse> {
    const columns = this.getExistingColumns(action.columnIds);

    if (!action.requiresConfirmation || columns.length === 0) {
      return this.clarify(
        action,
        this.t("aiService.deleteColumn.missingColumn"),
        this.getColumnOptions(),
      );
    }

    const affectedCardCount = columns.reduce(
      (total, column) => total + column.cardCount,
      0,
    );
    this.pendingConfirmation = {
      id: this.generateMessageId(),
      kind: "delete_column",
      message:
        action.message ||
        this.t("aiService.confirmDeleteColumnsAndCards", {
          columns: this.getItemCountLabel("column", columns.length),
          cards: this.getItemCountLabel("card", affectedCardCount),
        }),
      columnIds: columns.map((column) => column.id),
      itemTitles: columns.map((column) => column.title),
      affectedCardCount,
    };
    this.context.referencedItems = columns.map((column) => ({
      type: "column",
      ...column,
    }));

    return {
      success: false,
      message: this.pendingConfirmation.message,
      needsClarification: true,
      clarificationOptions: columns.map(
        (column) => `${column.title} (${column.cardCount} cards)`,
      ),
      pendingConfirmation: this.pendingConfirmation,
      ...this.getResponseMetadata(action),
    };
  }

  private validateCardData(cardData: unknown): ParsedCardData {
    if (!this.isRecord(cardData)) return {};

    const result: ParsedCardData = {};

    if (typeof cardData.title === "string" && cardData.title.trim())
      result.title = cardData.title.trim();
    if (typeof cardData.description === "string")
      result.description = cardData.description.trim();
    if (
      typeof cardData.priority === "string" &&
      this.isValidPriority(cardData.priority)
    )
      result.priority = cardData.priority;
    if (typeof cardData.assignee === "string")
      result.assignee = cardData.assignee.trim();
    if (typeof cardData.dueDate === "string")
      result.dueDate = cardData.dueDate.trim();
    if (
      typeof cardData.columnId === "string" &&
      this.api.getColumn(cardData.columnId)
    )
      result.columnId = cardData.columnId;
    if (Array.isArray(cardData.tags)) {
      result.tags = cardData.tags
        .filter(
          (tag): tag is string =>
            typeof tag === "string" && tag.trim().length > 0,
        )
        .map((tag) => tag.trim());
    }

    return result;
  }

  private validateColumnData(columnData: unknown): ParsedColumnData {
    if (!this.isRecord(columnData)) return {};

    const result: ParsedColumnData = {};

    if (typeof columnData.title === "string" && columnData.title.trim())
      result.title = columnData.title.trim();
    if (typeof columnData.description === "string")
      result.description = columnData.description.trim();
    if (
      typeof columnData.color === "string" &&
      columnColors.includes(columnData.color)
    )
      result.color = columnData.color;

    return result;
  }

  private validateFilters(filters: unknown): BoardQueryFilters {
    if (!this.isRecord(filters)) return {};

    const result: BoardQueryFilters = {};

    if (
      filters.type === "card" ||
      filters.type === "column" ||
      filters.type === "all"
    )
      result.type = filters.type;
    if (typeof filters.searchTerm === "string" && filters.searchTerm.trim())
      result.searchTerm = filters.searchTerm.trim();
    if (
      typeof filters.columnId === "string" &&
      this.api.getColumn(filters.columnId)
    )
      result.columnId = filters.columnId;
    if (
      typeof filters.priority === "string" &&
      this.isValidPriority(filters.priority)
    )
      result.priority = filters.priority;
    if (typeof filters.assignee === "string" && filters.assignee.trim())
      result.assignee = filters.assignee.trim();
    if (typeof filters.dueDate === "string" && filters.dueDate.trim())
      result.dueDate = filters.dueDate.trim();
    if (Array.isArray(filters.tags)) {
      result.tags = filters.tags
        .filter(
          (tag): tag is string =>
            typeof tag === "string" && tag.trim().length > 0,
        )
        .map((tag) => tag.trim());
    }

    return result;
  }

  private getLocalQueryAction(
    userMessage: string,
  ): Extract<LLMKanbanAction, { type: "query" }> | null {
    const normalizedMessage = userMessage.trim().toLowerCase();

    if (!normalizedMessage || this.isMutationRequest(normalizedMessage)) {
      return null;
    }

    const hasQueryIntent =
      /\b(show|list|find|search|filter|which|what|where|who)\b/.test(
        normalizedMessage,
      );
    const mentionsBoardItem =
      /\b(card|cards|task|tasks|column|columns|item|items|board)\b/.test(
        normalizedMessage,
      );
    const filters: BoardQueryFilters = {};

    if (
      /\bcolumns?\b/.test(normalizedMessage) &&
      !/\b(cards?|tasks?)\b/.test(normalizedMessage)
    ) {
      filters.type = "column";
    } else {
      filters.type = "card";
    }

    const priority = priorityOptions.find((option) =>
      new RegExp(`\\b${option}\\b(?:\\s+priority)?`).test(normalizedMessage),
    );

    if (priority) {
      filters.priority = priority;
    }

    const assignee = this.getLocalAssigneeFilter(userMessage);

    if (assignee) {
      filters.assignee = assignee;
    }

    const dueDate = this.getLocalDueDateFilter(normalizedMessage);

    if (dueDate) {
      filters.dueDate = dueDate;
    }

    const column = this.api
      .getSnapshot()
      .columns.find((column) =>
        normalizedMessage.includes(column.title.toLowerCase()),
      );

    if (column) {
      filters.columnId = column.id;
    }

    const hasFilter = Boolean(
      filters.priority ||
      filters.assignee ||
      filters.dueDate ||
      filters.columnId,
    );

    if (!hasFilter || (!hasQueryIntent && !mentionsBoardItem)) {
      return null;
    }

    return {
      type: "query",
      filters,
      suggestions: this.getTranslatedOptions([
        "aiService.localQuery.suggestions.urgentCards",
        "aiService.localQuery.suggestions.assignedToSamRivera",
        "aiService.localQuery.suggestions.cardsDueToday",
      ]),
      confidence: 1,
    };
  }

  private getLocalAssigneeFilter(userMessage: string): string | undefined {
    const assigneeMatch = userMessage.match(
      /\b(?:assigned to|owned by|for)\s+([a-z][a-z\s.'-]*?)(?:\s+(?:due|with|in|from|on)\b|[?.!,]|$)/i,
    );
    const assignee = assigneeMatch?.[1]?.trim();

    return assignee || undefined;
  }

  private getLocalDueDateFilter(normalizedMessage: string): string | undefined {
    if (/\bdue\s+today\b|\btoday'?s?\b/.test(normalizedMessage)) {
      return this.formatLocalDueDate(new Date());
    }

    if (/\bdue\s+tomorrow\b|\btomorrow'?s?\b/.test(normalizedMessage)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      return this.formatLocalDueDate(tomorrow);
    }

    return undefined;
  }

  private formatLocalDueDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  private isMutationRequest(normalizedMessage: string): boolean {
    return /\b(add|create|make|move|update|change|rename|assign|delete|remove|archive)\b/.test(
      normalizedMessage,
    );
  }

  private applyCardDefaults(cardData: ParsedCardData): CardContent {
    const defaults = createDefaultCardContent(cardData.title || "New card");

    return {
      description: cardData.description ?? defaults.description,
      priority: cardData.priority ?? defaults.priority,
      assignee: cardData.assignee || defaults.assignee,
      dueDate: cardData.dueDate || defaults.dueDate,
      tags:
        cardData.tags && cardData.tags.length > 0
          ? [...cardData.tags]
          : [...defaults.tags],
    };
  }

  private applyColumnDefaults(columnData: ParsedColumnData): ColumnContent {
    return {
      color: columnData.color || columnColors[0],
      description:
        columnData.description || this.t("defaults.newWorkflowStage"),
    };
  }

  private getCardContentUpdates(updates: ParsedCardData): Partial<CardContent> {
    const content: Partial<CardContent> = {};

    if (updates.description !== undefined)
      content.description = updates.description;
    if (updates.priority) content.priority = updates.priority;
    if (updates.assignee !== undefined)
      content.assignee = updates.assignee || "Unassigned";
    if (updates.dueDate !== undefined)
      content.dueDate = updates.dueDate || "TBD";
    if (updates.tags) content.tags = updates.tags;

    return content;
  }

  private getColumnContentUpdates(
    updates: ParsedColumnData,
  ): Partial<ColumnContent> {
    const content: Partial<ColumnContent> = {};

    if (updates.description !== undefined)
      content.description =
        updates.description || this.t("defaults.newWorkflowStage");
    if (updates.color) content.color = updates.color;

    return content;
  }

  private t(key: string, options?: Record<string, unknown>): string {
    return i18n.t(`kanban.${key}`, options);
  }

  private getTranslatedOptions(keys: string[]): string[] {
    return keys.map((key) => this.t(key));
  }

  private getItemCountLabel(
    itemType: "card" | "column",
    count: number,
  ): string {
    return this.t(`aiService.count.${itemType}`, { count });
  }

  private formatQueryResults(
    columns: FlatBoardColumn[],
    cards: FlatBoardCard[],
    filters: BoardQueryFilters,
  ): string {
    if (columns.length === 0 && cards.length === 0) {
      return this.t("aiService.query.noResults");
    }

    const totalCount = columns.length + cards.length;
    const lines = [
      this.t("aiService.query.found", {
        items: this.t("aiService.count.matchingItem", { count: totalCount }),
      }),
    ];

    if (columns.length > 0 && filters.type !== "card") {
      lines.push("", this.t("aiService.query.columnsHeading"));
      columns.slice(0, 6).forEach((column) => {
        lines.push(
          this.t("aiService.query.columnLine", {
            title: column.title,
            count: column.cardCount,
          }),
        );
      });
    }

    if (cards.length > 0 && filters.type !== "column") {
      lines.push("", this.t("aiService.query.cardsHeading"));
      cards.slice(0, 8).forEach((card) => {
        lines.push(
          this.t("aiService.query.cardLine", {
            title: card.title,
            columnTitle: card.columnTitle,
            priority: this.t(priorityLabelKeys[card.priority]),
            assignee: card.assignee,
          }),
        );
      });
    }

    if (totalCount > 14) {
      lines.push("", this.t("aiService.query.shortened"));
    }

    return lines.join("\n");
  }

  private clarify(
    action: LLMKanbanAction,
    message: string,
    options?: string[],
  ): AIResponse {
    return {
      success: false,
      message,
      needsClarification: true,
      clarificationOptions: options,
      ...this.getResponseMetadata(action),
    };
  }

  private getExistingCards(cardIds: string[] | undefined): FlatBoardCard[] {
    if (!Array.isArray(cardIds)) return [];

    return Array.from(new Set(cardIds))
      .map((cardId) => this.api.getCard(cardId))
      .filter((card): card is FlatBoardCard => Boolean(card));
  }

  private getExistingColumns(
    columnIds: string[] | undefined,
  ): FlatBoardColumn[] {
    if (!Array.isArray(columnIds)) return [];

    return Array.from(new Set(columnIds))
      .map((columnId) => this.api.getColumn(columnId))
      .filter((column): column is FlatBoardColumn => Boolean(column));
  }

  private getCardOptions(): string[] {
    return this.api
      .getSnapshot()
      .cards.slice(0, 4)
      .map((card) => `${card.title} in ${card.columnTitle}`);
  }

  private getColumnOptions(): string[] {
    return this.api
      .getSnapshot()
      .columns.slice(0, 4)
      .map((column) => column.title);
  }

  private getResponseMetadata(
    action: LLMKanbanAction,
  ): Pick<
    AIResponse,
    "suggestions" | "reasoningSummary" | "confidence" | "clarificationOptions"
  > {
    const metadata: Pick<
      AIResponse,
      "suggestions" | "reasoningSummary" | "confidence" | "clarificationOptions"
    > = {};
    const suggestions = this.validateOptions(action.suggestions);
    const clarificationOptions = this.validateOptions(
      action.clarificationOptions,
    );

    if (suggestions) metadata.suggestions = suggestions.slice(0, 4);
    if (clarificationOptions)
      metadata.clarificationOptions = clarificationOptions.slice(0, 4);
    if (
      typeof action.reasoningSummary === "string" &&
      action.reasoningSummary.trim()
    ) {
      metadata.reasoningSummary = action.reasoningSummary.trim();
    }
    if (
      typeof action.confidence === "number" &&
      Number.isFinite(action.confidence)
    ) {
      metadata.confidence = Math.max(0, Math.min(1, action.confidence));
    }

    return metadata;
  }

  private validateOptions(options: unknown): string[] | undefined {
    if (!Array.isArray(options)) return undefined;

    const validOptions = Array.from(
      new Set(
        options
          .filter(
            (option): option is string =>
              typeof option === "string" && option.trim().length > 0,
          )
          .map((option) => option.trim()),
      ),
    );

    return validOptions.length > 0 ? validOptions : undefined;
  }

  private addAssistantResponse(response: AIResponse): AIResponse {
    if (response.message) {
      this.addMessage("assistant", response.message, {
        suggestions: response.suggestions,
        clarificationOptions: response.clarificationOptions,
      });
    }

    return {
      ...response,
      pendingConfirmation: this.pendingConfirmation,
    };
  }

  private addMessage(
    role: "user" | "assistant",
    content: string,
    metadata?: Pick<AIMessage, "suggestions" | "clarificationOptions">,
  ) {
    const message: AIMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      ...metadata,
    };

    this.messages.push(message);
    this.context.recentMessages = this.messages.slice(-10);
  }

  private requireMessage(message: unknown): string {
    return typeof message === "string" && message.trim()
      ? message.trim()
      : this.t("aiService.replyFallback");
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isValidPriority(value: string): value is Priority {
    return priorityOptions.includes(value as Priority);
  }

  private validateCardMoveEdge(edge: unknown): "top" | "bottom" | "end" {
    return edge === "top" || edge === "bottom" || edge === "end" ? edge : "end";
  }

  private validateColumnMoveEdge(edge: unknown): "left" | "right" | "end" {
    return edge === "left" || edge === "right" || edge === "end" ? edge : "end";
  }
}
