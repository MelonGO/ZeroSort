import type {
  BoardItem,
  CardContent,
  ColumnContent,
  DropCardParams,
  Priority,
} from "./types";

export type CardDragState = {
  type: "card";
  cardId: string;
  fromColumnId: string;
};

export type ColumnDragState = {
  type: "column";
  columnId: string;
};

export type DragState = CardDragState | ColumnDragState;

export type CardDropTarget = {
  columnId: string;
  cardId: string | null;
  edge: DropCardParams["edge"];
};

export type ColumnDropTarget = {
  columnId: string;
  edge: "left" | "right";
};

type LegacyBoardItem = Omit<BoardItem, "type"> & {
  type?: string;
};

export type CardUpdates = {
  title: string;
  content: CardContent;
};

export type ColumnUpdates = {
  title: string;
  content: ColumnContent;
};

export const priorityLabels: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const priorityLabelKeys: Record<Priority, string> = {
  urgent: "priority.urgent",
  high: "priority.high",
  medium: "priority.medium",
  low: "priority.low",
};

export const priorityOptions: Priority[] = ["urgent", "high", "medium", "low"];
export const columnColors = [
  "#64748b",
  "#2563eb",
  "#9333ea",
  "#16a34a",
  "#ea580c",
];

export function isLegacySubItem(item: BoardItem | undefined) {
  return (item as LegacyBoardItem | undefined)?.type === "subitem";
}
