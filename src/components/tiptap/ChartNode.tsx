import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import { cn } from "@/lib/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { Suspense } from "react";

const LazyChartNodeView = React.lazy(() =>
  import("@/components/tiptap/ChartNodeView").then((module) => ({
    default: module.ChartNodeView,
  })),
);

/** Minimum height for the chart container in pixels */
const DEFAULT_HEIGHT = 500;

function ChartNodeFallback({ selected }: Pick<ReactNodeViewProps, "selected">) {
  return (
    <NodeViewWrapper
      className={cn("chart-node group relative", selected && "selected")}
      data-drag-handle
    >
      <div
        className="flex min-h-50 items-center justify-center rounded-md border bg-background p-8 text-sm text-muted-foreground"
        contentEditable={false}
      >
        Loading chart...
      </div>
    </NodeViewWrapper>
  );
}

function ChartNodeComponent(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<ChartNodeFallback selected={props.selected} />}>
      <LazyChartNodeView {...props} />
    </Suspense>
  );
}

/**
 * Custom Tiptap Node extension for rendering interactive Chart.js charts.
 * Stores chart configuration as a JSON string in the `config` attribute
 * and renders it as an interactive canvas visualization using react-chartjs-2.
 * Supports Line, Bar, Pie, Radar, and Bubble chart types.
 * Supports resizing via a bottom drag handle.
 */
export const ChartNode = Node.create({
  name: "chart",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      config: {
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
        tag: 'div[data-type="chart"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "chart" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeComponent);
  },

  ...createSafeAtomBlockMarkdownSpec({
    nodeName: "chart",
    allowedAttributes: ["config", "height"],
    defaultAttributes: { height: DEFAULT_HEIGHT },
  }),

  addCommands() {
    return {
      insertChart:
        (config: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { config },
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chart: {
      /** Insert a chart node with the given JSON configuration string. */
      insertChart: (config: string) => ReturnType;
    };
  }
}
