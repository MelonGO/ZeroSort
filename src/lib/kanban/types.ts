import type { ReactNode } from "react";

export type Priority = "urgent" | "high" | "medium" | "low";

export type CardContent = {
  description: string;
  priority: Priority;
  assignee: string;
  dueDate: string;
  tags: string[];
};

export type BoardItem = {
  id: string;
  title: string;
  parentId: string | null;
  children: string[];
  totalChildrenCount: number;
  totalItemsCount?: number;
  type?: "card" | "column";
  content?: CardContent | ColumnContent;
};

export type ColumnContent = {
  color: string;
  description: string;
};

export type BoardData = {
  root: BoardItem;
  [key: string]: BoardItem;
};

export interface KanbanNodeData {
  /** Schema version for future embedded board migrations. */
  version: 1;
  /** Normalized board data owned by this Tiptap kanban block. */
  board: BoardData;
}

export type CardRenderProps = {
  data: BoardItem;
  column: BoardItem;
  index: number;
  isDraggable: boolean;
};

export type ConfigMap = {
  [type: string]: {
    render: (props: CardRenderProps) => ReactNode;
    isDraggable?: boolean;
  };
};

export type DropCardParams = {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  targetCardId: string | null;
  edge: "top" | "bottom" | "end";
};
