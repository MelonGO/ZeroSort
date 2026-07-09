import {
  createInitialBoardData,
  normalizeBoardData,
} from "@/lib/kanban/kanban-board.utils";
import type { KanbanNodeData } from "@/lib/kanban/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function createDefaultKanbanNodeData(): KanbanNodeData {
  return {
    version: 1,
    board: createInitialBoardData(),
  };
}

export function normalizeKanbanNodeData(value: unknown): KanbanNodeData {
  if (typeof value === "string") {
    try {
      return normalizeKanbanNodeData(JSON.parse(value));
    } catch {
      return createDefaultKanbanNodeData();
    }
  }

  if (!isRecord(value)) {
    return createDefaultKanbanNodeData();
  }

  return {
    version: 1,
    board: normalizeBoardData(value.board),
  };
}

export function serializeKanbanNodeData(data: KanbanNodeData): string {
  return JSON.stringify(normalizeKanbanNodeData(data));
}
