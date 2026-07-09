import type { BoardData } from "./types";

function formatDueDate(dayOffset = 0) {
  const date = new Date();

  date.setDate(date.getDate() + dayOffset);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export const initialBoardData: BoardData = {
  root: {
    id: "root",
    title: "Root",
    parentId: null,
    children: ["todo", "doing", "done"],
    totalChildrenCount: 3,
    totalItemsCount: 3,
  },
  todo: {
    id: "todo",
    title: "To Do",
    parentId: "root",
    children: ["task-1", "task-2"],
    totalChildrenCount: 2,
    totalItemsCount: 2,
    type: "column",
    content: {
      color: "#64748b",
      description: "Next tasks to pick up",
    },
  },
  doing: {
    id: "doing",
    title: "Doing",
    parentId: "root",
    children: ["task-3"],
    totalChildrenCount: 1,
    totalItemsCount: 1,
    type: "column",
    content: {
      color: "#2563eb",
      description: "Work in progress",
    },
  },
  done: {
    id: "done",
    title: "Done",
    parentId: "root",
    children: ["task-4"],
    totalChildrenCount: 1,
    totalItemsCount: 1,
    type: "column",
    content: {
      color: "#16a34a",
      description: "Finished tasks",
    },
  },
  "task-1": {
    id: "task-1",
    title: "Write a short outline",
    parentId: "todo",
    children: [],
    totalChildrenCount: 0,
    type: "card",
    content: {
      description: "Capture the main points before starting.",
      priority: "medium",
      assignee: "You",
      dueDate: formatDueDate(),
      tags: ["Planning"],
    },
  },
  "task-2": {
    id: "task-2",
    title: "Collect needed files",
    parentId: "todo",
    children: [],
    totalChildrenCount: 0,
    type: "card",
    content: {
      description: "Gather notes, links, or assets in one place.",
      priority: "low",
      assignee: "You",
      dueDate: formatDueDate(1),
      tags: ["Prep"],
    },
  },
  "task-3": {
    id: "task-3",
    title: "Draft the first pass",
    parentId: "doing",
    children: [],
    totalChildrenCount: 0,
    type: "card",
    content: {
      description: "Turn the outline into something reviewable.",
      priority: "high",
      assignee: "You",
      dueDate: formatDueDate(),
      tags: ["Writing"],
    },
  },
  "task-4": {
    id: "task-4",
    title: "Set up the board",
    parentId: "done",
    children: [],
    totalChildrenCount: 0,
    type: "card",
    content: {
      description: "Create columns and add the first example task.",
      priority: "low",
      assignee: "You",
      dueDate: formatDueDate(-1),
      tags: ["Setup"],
    },
  },
};
