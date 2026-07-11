import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import {
  createDefaultKanbanNodeData,
  serializeKanbanNodeData,
} from "@/lib/kanban/kanbanData";
import type { KanbanNodeData } from "@/lib/kanban/types";
import { cn } from "@/lib/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { Suspense } from "react";

const LazyKanbanNodeView = React.lazy(() =>
  import("@/components/tiptap/KanbanNodeView").then((module) => ({
    default: module.KanbanNodeView,
  })),
);

const DEFAULT_HEIGHT = 760;

function KanbanNodeFallback({
  selected,
}: Pick<ReactNodeViewProps, "selected">) {
  return (
    <NodeViewWrapper
      className={cn("kanban-node group relative", selected && "selected")}
    >
      <div
        className="flex min-h-60 items-center justify-center rounded-md border bg-background p-8 text-sm text-muted-foreground"
        contentEditable={false}
      >
        Loading kanban board...
      </div>
    </NodeViewWrapper>
  );
}

function KanbanNodeComponent(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<KanbanNodeFallback selected={props.selected} />}>
      <LazyKanbanNodeView {...props} />
    </Suspense>
  );
}

/** Custom Tiptap node for self-contained kanban board blocks. */
export const KanbanNode = Node.create({
  name: "kanban",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      kanbanData: {
        default: serializeKanbanNodeData(createDefaultKanbanNodeData()),
      },
      height: {
        default: DEFAULT_HEIGHT,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="kanban"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "kanban" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KanbanNodeComponent);
  },

  ...createSafeAtomBlockMarkdownSpec({
    nodeName: "kanban",
    allowedAttributes: ["kanbanData", "height"],
    defaultAttributes: {
      kanbanData: serializeKanbanNodeData(createDefaultKanbanNodeData()),
      height: DEFAULT_HEIGHT,
    },
  }),

  addCommands() {
    return {
      insertKanban:
        (kanbanData?: Partial<KanbanNodeData>) =>
        ({ commands }) => {
          const nextData = kanbanData
            ? serializeKanbanNodeData({
                ...createDefaultKanbanNodeData(),
                ...kanbanData,
              })
            : serializeKanbanNodeData(createDefaultKanbanNodeData());

          return commands.insertContent({
            type: this.name,
            attrs: { kanbanData: nextData, height: DEFAULT_HEIGHT },
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    kanban: {
      /** Insert a self-contained kanban board block. */
      insertKanban: (kanbanData?: Partial<KanbanNodeData>) => ReturnType;
    };
  }
}
