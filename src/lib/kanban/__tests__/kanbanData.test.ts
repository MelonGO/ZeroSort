/**
 * Tests kanban node data normalization and serialization for embedded Tiptap kanban blocks.
 */
import {
  createDefaultKanbanNodeData,
  normalizeKanbanNodeData,
  serializeKanbanNodeData,
} from "@/lib/kanban/kanbanData";
import { describe, expect, it } from "vitest";

describe("kanbanData", () => {
  it("Should create a default versioned kanban payload", () => {
    const data = createDefaultKanbanNodeData();

    expect(data.version).toBe(1);
    expect(data.board.root.children.length).toBeGreaterThan(0);
  });

  it("Should normalize malformed data to a usable board", () => {
    const data = normalizeKanbanNodeData({
      board: {
        root: {
          id: "root",
          title: "Root",
          parentId: null,
          children: ["todo"],
          totalChildrenCount: 99,
        },
        todo: {
          id: "todo",
          title: "To do",
          parentId: "root",
          children: [],
          totalChildrenCount: 4,
          type: "column",
          content: {
            color: "#2563eb",
            description: "Next work",
          },
        },
      },
    });

    expect(data.version).toBe(1);
    expect(data.board.root.totalChildrenCount).toBe(1);
    expect(data.board.todo.totalItemsCount).toBe(0);
  });

  it("Should round-trip serialized kanban data", () => {
    const serialized = serializeKanbanNodeData(createDefaultKanbanNodeData());
    const data = normalizeKanbanNodeData(serialized);

    expect(data.board.root.id).toBe("root");
    expect(data.board.root.children.length).toBeGreaterThan(0);
  });
});
