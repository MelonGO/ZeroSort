import type {
  BoardQueryFilters,
  KanbanAPIChangeHandler,
  KanbanCardDraft,
  KanbanColumnDraft,
} from "@/lib/kanban/ai/kanban-ai.types";
import {
  addCardWithContent,
  addColumnWithContent,
  deleteCard,
  deleteColumn,
  flattenBoardData,
  getCardContent,
  getColumnContent,
  moveCardToPosition,
  moveColumn,
  moveColumnToIndex,
  updateCard,
  updateColumn,
  type FlatBoardCard,
  type FlatBoardColumn,
  type FlatBoardSnapshot,
} from "@/lib/kanban/kanban-board.utils";
import type {
  BoardData,
  BoardItem,
  CardContent,
  ColumnContent,
} from "@/lib/kanban/types";

export class KanbanAPIService {
  private board: BoardData;
  private onBoardChange: KanbanAPIChangeHandler;

  constructor(board: BoardData, onBoardChange: KanbanAPIChangeHandler) {
    this.board = board;
    this.onBoardChange = onBoardChange;
  }

  setBoard(board: BoardData) {
    this.board = board;
  }

  getBoard(): BoardData {
    return this.board;
  }

  getSnapshot(): FlatBoardSnapshot {
    return flattenBoardData(this.board);
  }

  async createCard(draft: KanbanCardDraft): Promise<FlatBoardCard | null> {
    const previousCardIds = new Set(
      this.getSnapshot().cards.map((card) => card.id),
    );
    const nextBoard = addCardWithContent(
      this.board,
      draft.columnId,
      draft.title,
      draft.content,
    );

    if (nextBoard === this.board) {
      return null;
    }

    const createdCardId = flattenBoardData(nextBoard).cards.find(
      (card) => !previousCardIds.has(card.id),
    )?.id;

    this.commit(
      nextBoard,
      "created",
      "card",
      createdCardId ? [createdCardId] : [],
    );
    return (
      this.getSnapshot().cards.find((card) => !previousCardIds.has(card.id)) ??
      null
    );
  }

  async createColumn(
    draft: KanbanColumnDraft,
  ): Promise<FlatBoardColumn | null> {
    const previousColumnIds = new Set(
      this.getSnapshot().columns.map((column) => column.id),
    );
    const nextBoard = addColumnWithContent(
      this.board,
      draft.title,
      draft.content,
    );

    if (nextBoard === this.board) {
      return null;
    }

    const createdColumnId = flattenBoardData(nextBoard).columns.find(
      (column) => !previousColumnIds.has(column.id),
    )?.id;

    this.commit(
      nextBoard,
      "created",
      "column",
      createdColumnId ? [createdColumnId] : [],
    );
    return (
      this.getSnapshot().columns.find(
        (column) => !previousColumnIds.has(column.id),
      ) ?? null
    );
  }

  async updateCard(
    cardId: string,
    updates: { title?: string; content?: Partial<CardContent> },
  ): Promise<FlatBoardCard | null> {
    const card = this.getCardItem(cardId);

    if (!card) {
      return null;
    }

    const currentContent =
      getCardContent(card) ?? this.getFallbackCardContent(card.title);
    const nextContent: CardContent = {
      ...currentContent,
      ...updates.content,
      tags: updates.content?.tags
        ? [...updates.content.tags]
        : [...currentContent.tags],
    };
    const nextBoard = updateCard(this.board, cardId, {
      title: updates.title ?? card.title,
      content: nextContent,
    });

    this.commit(nextBoard, "updated", "card", [cardId]);
    return this.getCard(cardId);
  }

  async updateColumn(
    columnId: string,
    updates: { title?: string; content?: Partial<ColumnContent> },
  ): Promise<FlatBoardColumn | null> {
    const column = this.getColumnItem(columnId);

    if (!column) {
      return null;
    }

    const currentContent = getColumnContent(column) ?? {
      color: "#64748b",
      description: "New workflow stage",
    };
    const nextBoard = updateColumn(this.board, columnId, {
      title: updates.title ?? column.title,
      content: {
        ...currentContent,
        ...updates.content,
      },
    });

    this.commit(nextBoard, "updated", "column", [columnId]);
    return this.getColumn(columnId);
  }

  async moveCard(
    cardId: string,
    toColumnId: string,
    targetCardId?: string | null,
    edge: "top" | "bottom" | "end" = "end",
  ): Promise<FlatBoardCard | null> {
    const nextBoard = moveCardToPosition(
      this.board,
      cardId,
      toColumnId,
      targetCardId,
      edge,
    );

    if (nextBoard === this.board) {
      return null;
    }

    this.commit(nextBoard, "moved", "card", [cardId]);
    return this.getCard(cardId);
  }

  async moveColumn(
    columnId: string,
    targetColumnId?: string | null,
    edge: "left" | "right" | "end" = "end",
    targetIndex?: number,
  ): Promise<FlatBoardColumn | null> {
    const nextBoard =
      edge === "end" || !targetColumnId
        ? moveColumnToIndex(this.board, columnId, targetIndex)
        : moveColumn(this.board, columnId, targetColumnId, edge);

    if (nextBoard === this.board) {
      return null;
    }

    this.commit(nextBoard, "moved", "column", [columnId]);
    return this.getColumn(columnId);
  }

  async deleteCardById(cardId: string): Promise<boolean> {
    const nextBoard = deleteCard(this.board, cardId);

    if (nextBoard === this.board) {
      return false;
    }

    this.commit(nextBoard, "deleted", "card", [cardId]);
    return true;
  }

  async deleteColumnById(columnId: string): Promise<boolean> {
    const nextBoard = deleteColumn(this.board, columnId);

    if (nextBoard === this.board) {
      return false;
    }

    this.commit(nextBoard, "deleted", "column", [columnId]);
    return true;
  }

  async query(
    filters: BoardQueryFilters,
  ): Promise<{ columns: FlatBoardColumn[]; cards: FlatBoardCard[] }> {
    const snapshot = this.getSnapshot();
    const type = filters.type ?? "all";
    const searchTerm = filters.searchTerm?.trim().toLowerCase();
    const assignee = filters.assignee?.trim().toLowerCase();
    const dueDate = filters.dueDate?.trim().toLowerCase();
    const tagSet = new Set(
      filters.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    );

    const columns =
      type === "card"
        ? []
        : snapshot.columns.filter((column) => {
            if (filters.columnId && column.id !== filters.columnId)
              return false;
            if (!searchTerm) return true;

            return `${column.title} ${column.description}`
              .toLowerCase()
              .includes(searchTerm);
          });

    const cards =
      type === "column"
        ? []
        : snapshot.cards.filter((card) => {
            if (filters.columnId && card.columnId !== filters.columnId)
              return false;
            if (filters.priority && card.priority !== filters.priority)
              return false;
            if (assignee && !card.assignee.toLowerCase().includes(assignee))
              return false;
            if (dueDate && !card.dueDate.toLowerCase().includes(dueDate))
              return false;
            if (
              tagSet.size > 0 &&
              !card.tags.some((tag) => tagSet.has(tag.toLowerCase()))
            )
              return false;
            if (!searchTerm) return true;

            return [
              card.title,
              card.description,
              card.assignee,
              card.dueDate,
              card.columnTitle,
              card.priority,
              ...card.tags,
            ]
              .join(" ")
              .toLowerCase()
              .includes(searchTerm);
          });

    return { columns, cards };
  }

  getCard(cardId: string): FlatBoardCard | null {
    return this.getSnapshot().cards.find((card) => card.id === cardId) ?? null;
  }

  getColumn(columnId: string): FlatBoardColumn | null {
    return (
      this.getSnapshot().columns.find((column) => column.id === columnId) ??
      null
    );
  }

  getCardItem(cardId: string): BoardItem | null {
    const item = this.board[cardId];
    return item?.type === "card" ? item : null;
  }

  getColumnItem(columnId: string): BoardItem | null {
    const item = this.board[columnId];
    return item?.type === "column" ? item : null;
  }

  private commit(
    board: BoardData,
    kind: "created" | "updated" | "moved" | "deleted",
    itemType: "card" | "column",
    itemIds: string[] = [],
  ) {
    this.board = board;
    this.onBoardChange(board, { kind, itemType, itemIds });
  }

  private getFallbackCardContent(title: string): CardContent {
    return {
      description: `Define the next action for ${title.toLowerCase()}.`,
      priority: "medium",
      assignee: "Unassigned",
      dueDate: "TBD",
      tags: ["New"],
    };
  }
}
