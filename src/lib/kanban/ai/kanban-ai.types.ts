import type {
  FlatBoardCard,
  FlatBoardColumn,
} from "@/lib/kanban/kanban-board.utils";
import type {
  BoardData,
  CardContent,
  ColumnContent,
  Priority,
} from "@/lib/kanban/types";

export type AIMessageRole = "user" | "assistant" | "system";

export type AIMessage = {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: Date;
  suggestions?: string[];
  clarificationOptions?: string[];
};

export type ParsedCardData = {
  title?: string;
  description?: string;
  priority?: Priority;
  assignee?: string;
  dueDate?: string;
  tags?: string[];
  columnId?: string;
};

export type ParsedColumnData = {
  title?: string;
  description?: string;
  color?: string;
};

export type BoardQueryFilters = {
  type?: "card" | "column" | "all";
  searchTerm?: string;
  columnId?: string;
  priority?: Priority;
  assignee?: string;
  dueDate?: string;
  tags?: string[];
};

export type BoardMoveEdge = "top" | "bottom" | "end" | "left" | "right";

export type AIResponseMetadata = {
  message?: string;
  reasoningSummary?: string;
  suggestions?: string[];
  confidence?: number;
  clarificationOptions?: string[];
};

export type LLMKanbanAction =
  | ({ type: "reply"; message: string } & AIResponseMetadata)
  | ({
      type: "clarify";
      message: string;
      options?: string[];
    } & AIResponseMetadata)
  | ({ type: "create_card"; cardData: ParsedCardData } & AIResponseMetadata)
  | ({
      type: "create_column";
      columnData: ParsedColumnData;
    } & AIResponseMetadata)
  | ({ type: "query"; filters: BoardQueryFilters } & AIResponseMetadata)
  | ({
      type: "update_card";
      cardId: string;
      updates: ParsedCardData;
    } & AIResponseMetadata)
  | ({
      type: "update_column";
      columnId: string;
      updates: ParsedColumnData;
    } & AIResponseMetadata)
  | ({
      type: "move_card";
      cardId: string;
      toColumnId: string;
      targetCardId?: string | null;
      edge?: Extract<BoardMoveEdge, "top" | "bottom" | "end">;
    } & AIResponseMetadata)
  | ({
      type: "move_column";
      columnId: string;
      targetColumnId?: string | null;
      edge?: Extract<BoardMoveEdge, "left" | "right" | "end">;
      targetIndex?: number;
    } & AIResponseMetadata)
  | ({
      type: "delete_card";
      cardIds: string[];
      requiresConfirmation: true;
    } & AIResponseMetadata)
  | ({
      type: "delete_column";
      columnIds: string[];
      requiresConfirmation: true;
    } & AIResponseMetadata);

export type PendingKanbanAction =
  | {
      id: string;
      kind: "delete_card";
      message: string;
      cardIds: string[];
      itemTitles: string[];
    }
  | {
      id: string;
      kind: "delete_column";
      message: string;
      columnIds: string[];
      itemTitles: string[];
      affectedCardCount: number;
    };

export type AIResponse = {
  success: boolean;
  message: string;
  data?: unknown;
  needsClarification?: boolean;
  clarificationOptions?: string[];
  suggestions?: string[];
  reasoningSummary?: string;
  confidence?: number;
  pendingConfirmation?: PendingKanbanAction;
};

export type BoardReference =
  | ({ type: "card" } & FlatBoardCard)
  | ({ type: "column" } & FlatBoardColumn);

export type ConversationContext = {
  recentMessages: AIMessage[];
  referencedItems: BoardReference[];
  userPreferences: {
    defaultColumnId?: string;
  };
};

export type KanbanProviderContext = {
  userMessage: string;
  recentMessages: AIMessage[];
  referencedItems: BoardReference[];
  board: BoardData;
  columns: FlatBoardColumn[];
  cards: FlatBoardCard[];
  now: string;
  timezone: string;
  pendingConfirmation?: PendingKanbanAction;
};

export type KanbanChangeKind = "created" | "updated" | "moved" | "deleted";

export type KanbanChange = {
  kind: KanbanChangeKind;
  itemType: "card" | "column";
  itemIds: string[];
};

export type KanbanAPIChangeHandler = (
  board: BoardData,
  change?: KanbanChange,
) => void;

export type KanbanCardDraft = {
  title: string;
  columnId: string;
  content: CardContent;
};

export type KanbanColumnDraft = {
  title: string;
  content: ColumnContent;
};
