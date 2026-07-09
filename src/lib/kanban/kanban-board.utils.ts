import type { DragEvent } from "react";

import { initialBoardData } from "@/lib/kanban/kanban-data";
import { isLegacySubItem, type ColumnDropTarget } from "./kanban-board.shared";
import type {
  BoardData,
  BoardItem,
  CardContent,
  ColumnContent,
  DropCardParams,
} from "./types";

const LEGACY_BOARD_STORAGE_KEY = "kanban-pro-board-data";
const BOARD_STORAGE_KEY = `${LEGACY_BOARD_STORAGE_KEY}:v1`;

export function getBoardStorageKey() {
  return BOARD_STORAGE_KEY;
}

export function getLegacyBoardStorageKey() {
  return LEGACY_BOARD_STORAGE_KEY;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneBoardData(dataSource: BoardData): BoardData {
  return Object.fromEntries(
    Object.entries(dataSource).map(([key, item]) => [
      key,
      {
        ...item,
        children: [...item.children],
      },
    ]),
  ) as BoardData;
}

function removeSubItems(dataSource: BoardData): BoardData {
  Object.keys(dataSource).forEach((itemId) => {
    if (isLegacySubItem(dataSource[itemId])) {
      delete dataSource[itemId];
    }
  });

  Object.values(dataSource).forEach((item) => {
    item.children = item.children.filter((childId) => {
      const child = dataSource[childId];

      return Boolean(child) && !isLegacySubItem(child);
    });
  });

  return dataSource;
}

function isBoardData(value: unknown): value is BoardData {
  if (!value || typeof value !== "object" || !("root" in value)) {
    return false;
  }

  const root = (value as Record<string, unknown>).root;

  return (
    Boolean(root) &&
    typeof root === "object" &&
    Array.isArray((root as BoardItem).children)
  );
}

export function getCardContent(item: BoardItem): CardContent | null {
  return item.content && "priority" in item.content ? item.content : null;
}

export function getColumnContent(item: BoardItem): ColumnContent | null {
  return item.content && "color" in item.content ? item.content : null;
}

export function createDefaultCardContent(title: string): CardContent {
  return {
    description: `Define the next action for ${title.toLowerCase()}.`,
    priority: "medium",
    assignee: "Unassigned",
    dueDate: "TBD",
    tags: ["New"],
  };
}

function recalculateCounts(dataSource: BoardData): BoardData {
  Object.values(dataSource).forEach((item) => {
    item.totalChildrenCount = item.children.length;

    if (item.type === "column") {
      item.totalItemsCount = item.children.length;
    } else if (item.id === "root") {
      item.totalItemsCount = item.children.length;
    } else {
      item.totalItemsCount = 0;
    }
  });

  return dataSource;
}

export function createInitialBoardData(): BoardData {
  return recalculateCounts(removeSubItems(cloneBoardData(initialBoardData)));
}

export function normalizeBoardData(value: unknown): BoardData {
  if (typeof value === "string") {
    try {
      return normalizeBoardData(JSON.parse(value));
    } catch {
      return createInitialBoardData();
    }
  }

  if (!isBoardData(value)) {
    return createInitialBoardData();
  }

  return recalculateCounts(removeSubItems(cloneBoardData(value)));
}

function clearStoredBoardData() {
  try {
    window.localStorage.removeItem(BOARD_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_BOARD_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures and continue with the bundled board.
  }
}

function parseStoredBoardData(
  storedBoardData: string | null,
): BoardData | null {
  if (!storedBoardData) {
    return null;
  }

  const parsedBoardData: unknown = JSON.parse(storedBoardData);

  if (!isBoardData(parsedBoardData)) {
    return null;
  }

  return normalizeBoardData(parsedBoardData);
}

export function getInitialBoardData(): BoardData {
  if (typeof window === "undefined") {
    return createInitialBoardData();
  }

  try {
    const storedBoardData =
      parseStoredBoardData(window.localStorage.getItem(BOARD_STORAGE_KEY)) ??
      parseStoredBoardData(
        window.localStorage.getItem(LEGACY_BOARD_STORAGE_KEY),
      );

    if (storedBoardData) {
      return storedBoardData;
    }
  } catch {
    clearStoredBoardData();
  }

  return createInitialBoardData();
}

export function addColumn(
  dataSource: BoardData,
  title: string,
  description: string,
  color: string,
): BoardData {
  const nextDataSource = cloneBoardData(dataSource);
  const columnId = createId("column");

  nextDataSource[columnId] = {
    id: columnId,
    title,
    parentId: "root",
    children: [],
    totalChildrenCount: 0,
    totalItemsCount: 0,
    type: "column",
    content: {
      color,
      description: description || "New workflow stage",
    },
  };
  nextDataSource.root.children.push(columnId);

  return recalculateCounts(nextDataSource);
}

export function addColumnWithContent(
  dataSource: BoardData,
  title: string,
  content: ColumnContent,
): BoardData {
  return addColumn(dataSource, title, content.description, content.color);
}

export function addCard(
  dataSource: BoardData,
  columnId: string,
  title: string,
): BoardData {
  return addCardWithContent(
    dataSource,
    columnId,
    title,
    createDefaultCardContent(title),
  );
}

export function addCardWithContent(
  dataSource: BoardData,
  columnId: string,
  title: string,
  content: CardContent,
): BoardData {
  const nextDataSource = cloneBoardData(dataSource);
  const column = nextDataSource[columnId];

  if (!column || column.type !== "column") {
    return dataSource;
  }

  const cardId = createId("task");

  nextDataSource[cardId] = {
    id: cardId,
    title,
    parentId: columnId,
    children: [],
    totalChildrenCount: 0,
    type: "card",
    content: {
      ...content,
      tags: [...content.tags],
    },
  };
  column.children.push(cardId);

  return recalculateCounts(nextDataSource);
}

export function updateCard(
  dataSource: BoardData,
  cardId: string,
  updates: { title: string; content: CardContent },
): BoardData {
  const nextDataSource = cloneBoardData(dataSource);
  const card = nextDataSource[cardId];

  if (!card || card.type !== "card") {
    return dataSource;
  }

  nextDataSource[cardId] = {
    ...card,
    title: updates.title,
    content: {
      ...updates.content,
      tags: [...updates.content.tags],
    },
  };

  return recalculateCounts(nextDataSource);
}

export function updateColumn(
  dataSource: BoardData,
  columnId: string,
  updates: { title: string; content: ColumnContent },
): BoardData {
  const nextDataSource = cloneBoardData(dataSource);
  const column = nextDataSource[columnId];

  if (!column || column.type !== "column") {
    return dataSource;
  }

  nextDataSource[columnId] = {
    ...column,
    title: updates.title,
    content: {
      color: updates.content.color,
      description: updates.content.description,
    },
  };

  return recalculateCounts(nextDataSource);
}

export function deleteColumn(
  dataSource: BoardData,
  columnId: string,
): BoardData {
  const nextDataSource = cloneBoardData(dataSource);
  const column = nextDataSource[columnId];

  if (!column || column.type !== "column") {
    return dataSource;
  }

  nextDataSource.root.children = nextDataSource.root.children.filter(
    (id) => id !== columnId,
  );

  column.children.forEach((cardId) => {
    delete nextDataSource[cardId];
  });

  delete nextDataSource[columnId];

  return recalculateCounts(nextDataSource);
}

export function deleteCard(dataSource: BoardData, cardId: string): BoardData {
  const nextDataSource = cloneBoardData(dataSource);
  const card = nextDataSource[cardId];

  if (!card || card.type !== "card" || !card.parentId) {
    return dataSource;
  }

  const column = nextDataSource[card.parentId];

  if (!column || column.type !== "column") {
    return dataSource;
  }

  column.children = column.children.filter((id) => id !== cardId);
  delete nextDataSource[cardId];

  return recalculateCounts(nextDataSource);
}

export function moveColumn(
  dataSource: BoardData,
  columnId: string,
  targetColumnId: string,
  edge: ColumnDropTarget["edge"],
): BoardData {
  if (columnId === targetColumnId) {
    return dataSource;
  }

  const nextDataSource = cloneBoardData(dataSource);
  const root = nextDataSource.root;
  const nextColumns = root.children.filter((id) => id !== columnId);
  const targetIndex = nextColumns.indexOf(targetColumnId);

  if (targetIndex === -1) {
    return dataSource;
  }

  nextColumns.splice(
    edge === "left" ? targetIndex : targetIndex + 1,
    0,
    columnId,
  );
  root.children = nextColumns;

  return recalculateCounts(nextDataSource);
}

export function moveColumnToIndex(
  dataSource: BoardData,
  columnId: string,
  targetIndex?: number,
): BoardData {
  const currentIndex = dataSource.root.children.indexOf(columnId);

  if (currentIndex === -1) {
    return dataSource;
  }

  const nextDataSource = cloneBoardData(dataSource);
  const nextColumns = nextDataSource.root.children.filter(
    (id) => id !== columnId,
  );
  const safeIndex =
    typeof targetIndex === "number" && Number.isFinite(targetIndex)
      ? Math.max(0, Math.min(targetIndex, nextColumns.length))
      : nextColumns.length;

  nextColumns.splice(safeIndex, 0, columnId);
  nextDataSource.root.children = nextColumns;

  return recalculateCounts(nextDataSource);
}

export function moveCard(
  dataSource: BoardData,
  drop: DropCardParams,
): BoardData {
  const { cardId, fromColumnId, toColumnId, targetCardId, edge } = drop;

  if (cardId === targetCardId) {
    return dataSource;
  }

  const nextDataSource = cloneBoardData(dataSource);
  const card = nextDataSource[cardId];
  const sourceColumn = nextDataSource[fromColumnId];
  const targetColumn = nextDataSource[toColumnId];

  if (!card || !sourceColumn || !targetColumn || card.type === "column") {
    return dataSource;
  }

  if (sourceColumn.type !== "column" || targetColumn.type !== "column") {
    return dataSource;
  }

  sourceColumn.children = sourceColumn.children.filter((id) => id !== cardId);

  const targetChildren =
    fromColumnId === toColumnId ? sourceColumn.children : targetColumn.children;
  const targetIndex = targetCardId ? targetChildren.indexOf(targetCardId) : -1;
  const insertIndex =
    edge === "end" || targetIndex === -1
      ? targetChildren.length
      : targetIndex + (edge === "bottom" ? 1 : 0);

  targetChildren.splice(insertIndex, 0, cardId);
  card.parentId = toColumnId;
  card.type = "card";

  return recalculateCounts(nextDataSource);
}

export function moveCardToPosition(
  dataSource: BoardData,
  cardId: string,
  toColumnId: string,
  targetCardId?: string | null,
  edge: DropCardParams["edge"] = "end",
): BoardData {
  const card = dataSource[cardId];

  if (!card || card.type !== "card" || !card.parentId) {
    return dataSource;
  }

  return moveCard(dataSource, {
    cardId,
    fromColumnId: card.parentId,
    toColumnId,
    targetCardId: targetCardId ?? null,
    edge,
  });
}

export function getColumns(dataSource: BoardData) {
  return dataSource.root.children
    .map((columnId) => dataSource[columnId])
    .filter((column): column is BoardItem => Boolean(column));
}

export function getChildren(dataSource: BoardData, parent: BoardItem) {
  return parent.children
    .map((childId) => dataSource[childId])
    .filter((item): item is BoardItem => Boolean(item));
}

export type FlatBoardColumn = {
  id: string;
  title: string;
  description: string;
  color: string;
  cardCount: number;
  index: number;
};

export type FlatBoardCard = {
  id: string;
  title: string;
  description: string;
  priority: CardContent["priority"];
  assignee: string;
  dueDate: string;
  tags: string[];
  columnId: string;
  columnTitle: string;
  index: number;
};

export type FlatBoardSnapshot = {
  columns: FlatBoardColumn[];
  cards: FlatBoardCard[];
};

export function flattenBoardData(dataSource: BoardData): FlatBoardSnapshot {
  const columns = getColumns(dataSource);
  const cards: FlatBoardCard[] = [];

  const flatColumns = columns.map((column, columnIndex) => {
    const columnContent = getColumnContent(column) ?? {
      color: "#64748b",
      description: "",
    };
    const columnCards = getChildren(dataSource, column).filter(
      (card) => card.type === "card",
    );

    columnCards.forEach((card, cardIndex) => {
      const cardContent =
        getCardContent(card) ?? createDefaultCardContent(card.title);

      cards.push({
        id: card.id,
        title: card.title,
        description: cardContent.description,
        priority: cardContent.priority,
        assignee: cardContent.assignee,
        dueDate: cardContent.dueDate,
        tags: [...cardContent.tags],
        columnId: column.id,
        columnTitle: column.title,
        index: cardIndex,
      });
    });

    return {
      id: column.id,
      title: column.title,
      description: columnContent.description,
      color: columnContent.color,
      cardCount: columnCards.length,
      index: columnIndex,
    };
  });

  return {
    columns: flatColumns,
    cards,
  };
}

export function getColumnEdge(
  event: DragEvent<HTMLElement>,
): ColumnDropTarget["edge"] {
  const bounds = event.currentTarget.getBoundingClientRect();

  return event.clientX - bounds.left > bounds.width / 2 ? "right" : "left";
}

export function getCardEdge(
  event: DragEvent<HTMLElement>,
): DropCardParams["edge"] {
  const bounds = event.currentTarget.getBoundingClientRect();

  return event.clientY - bounds.top > bounds.height / 2 ? "bottom" : "top";
}
