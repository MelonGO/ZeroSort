import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import { cn } from "@/lib/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { Suspense } from "react";

const LazyMermaidNodeView = React.lazy(() =>
  import("@/components/tiptap/MermaidNodeView").then((module) => ({
    default: module.MermaidNodeView,
  })),
);

/** Default height for the mermaid container in pixels */
const DEFAULT_HEIGHT = 300;

function MermaidNodeFallback({
  selected,
}: Pick<ReactNodeViewProps, "selected">) {
  return (
    <NodeViewWrapper
      className={cn(
        "mermaid-diagram-node group relative",
        selected && "selected",
      )}
    >
      <div
        className="flex min-h-37.5 items-center justify-center rounded-md border bg-background p-8 text-sm text-muted-foreground"
        contentEditable={false}
      >
        Loading diagram...
      </div>
    </NodeViewWrapper>
  );
}

function MermaidNodeComponent(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<MermaidNodeFallback selected={props.selected} />}>
      <LazyMermaidNodeView {...props} />
    </Suspense>
  );
}

/** Custom Tiptap node for Mermaid diagrams. */
export const MermaidNode = Node.create({
  name: "mermaidDiagram",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      content: {
        default: "",
      },
      height: {
        default: DEFAULT_HEIGHT,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid-diagram"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid-diagram" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeComponent);
  },

  ...createSafeAtomBlockMarkdownSpec({
    nodeName: "mermaidDiagram",
    allowedAttributes: ["content", "height"],
    defaultAttributes: { height: DEFAULT_HEIGHT },
  }),

  addCommands() {
    return {
      insertMermaid:
        (content: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { content },
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidDiagram: {
      /** Insert a Mermaid diagram node with the given source content. */
      insertMermaid: (content: string) => ReturnType;
    };
  }
}
