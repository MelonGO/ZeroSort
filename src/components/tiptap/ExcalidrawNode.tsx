import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import { cn } from "@/lib/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { Suspense } from "react";

const LazyExcalidrawNodeView = React.lazy(() =>
  Promise.all([
    import("@/components/tiptap/ExcalidrawNodeView"),
    import("@excalidraw/excalidraw/index.css"),
  ]).then(([module]) => ({
    default: module.ExcalidrawNodeView,
  })),
);

/** Default height for the excalidraw container in pixels */
const DEFAULT_HEIGHT = 500;

function ExcalidrawNodeFallback({
  selected,
}: Pick<ReactNodeViewProps, "selected">) {
  return (
    <NodeViewWrapper
      className={cn("excalidraw-node group relative", selected && "selected")}
    >
      <div
        className="flex min-h-50 items-center justify-center rounded-md border bg-background p-8 text-sm text-muted-foreground"
        contentEditable={false}
      >
        Loading drawing...
      </div>
    </NodeViewWrapper>
  );
}

function ExcalidrawNodeComponent(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<ExcalidrawNodeFallback selected={props.selected} />}>
      <LazyExcalidrawNodeView {...props} />
    </Suspense>
  );
}

/** Custom Tiptap node for Excalidraw scenes. */
export const ExcalidrawNode = Node.create({
  name: "excalidraw",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      sceneData: {
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
        tag: 'div[data-type="excalidraw"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "excalidraw" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawNodeComponent);
  },

  ...createSafeAtomBlockMarkdownSpec({
    nodeName: "excalidraw",
    allowedAttributes: ["sceneData", "height"],
    defaultAttributes: { height: DEFAULT_HEIGHT },
  }),

  addCommands() {
    return {
      insertExcalidraw:
        (sceneData?: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              sceneData: sceneData || "",
            },
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    excalidraw: {
      /** Insert an Excalidraw node with optional persisted scene data. */
      insertExcalidraw: (sceneData?: string) => ReturnType;
    };
  }
}
