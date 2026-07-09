import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import { cn } from "@/lib/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { Suspense } from "react";

const LazyMarkmapNodeView = React.lazy(() =>
  import("@/components/tiptap/MarkmapNodeView").then((module) => ({
    default: module.MarkmapNodeView,
  })),
);

/** Default height for the markmap container in pixels */
const DEFAULT_HEIGHT = 300;

function MarkmapNodeFallback({
  selected,
}: Pick<ReactNodeViewProps, "selected">) {
  return (
    <NodeViewWrapper
      className={cn("markmap-node group relative", selected && "selected")}
    >
      <div
        className="flex min-h-37.5 items-center justify-center rounded-md bg-background p-8 text-sm text-muted-foreground"
        contentEditable={false}
      >
        Loading mind map...
      </div>
    </NodeViewWrapper>
  );
}

function MarkmapNodeComponent(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<MarkmapNodeFallback selected={props.selected} />}>
      <LazyMarkmapNodeView {...props} />
    </Suspense>
  );
}

/** Custom Tiptap node for Markmap diagrams. */
export const MarkmapNode = Node.create({
  name: "markmap",

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
        tag: 'div[data-type="markmap"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "markmap" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MarkmapNodeComponent);
  },

  ...createSafeAtomBlockMarkdownSpec({
    nodeName: "markmap",
    allowedAttributes: ["content", "height"],
    defaultAttributes: { height: DEFAULT_HEIGHT },
  }),

  addCommands() {
    return {
      insertMarkmap:
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
    markmap: {
      /** Insert a markmap node with the given markdown source. */
      insertMarkmap: (content: string) => ReturnType;
    };
  }
}
