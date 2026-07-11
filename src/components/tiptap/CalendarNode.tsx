import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import {
  createDefaultCalendarNodeData,
  serializeCalendarNodeData,
} from "@/lib/calendar/calendarData";
import type { CalendarNodeData } from "@/lib/calendar/types";
import { cn } from "@/lib/utils";
import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { Suspense } from "react";

const LazyCalendarNodeView = React.lazy(() =>
  import("@/components/tiptap/CalendarNodeView").then((module) => ({
    default: module.CalendarNodeView,
  })),
);

const DEFAULT_HEIGHT = 1280;

function CalendarNodeFallback({
  selected,
}: Pick<ReactNodeViewProps, "selected">) {
  return (
    <NodeViewWrapper
      className={cn("calendar-node group relative", selected && "selected")}
    >
      <div
        className="flex min-h-60 items-center justify-center rounded-md border bg-background p-8 text-sm text-muted-foreground"
        contentEditable={false}
      >
        Loading calendar...
      </div>
    </NodeViewWrapper>
  );
}

function CalendarNodeComponent(props: ReactNodeViewProps) {
  return (
    <Suspense fallback={<CalendarNodeFallback selected={props.selected} />}>
      <LazyCalendarNodeView {...props} />
    </Suspense>
  );
}

/** Custom Tiptap node for self-contained calendar blocks. */
export const CalendarNode = Node.create({
  name: "calendar",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      calendarData: {
        default: serializeCalendarNodeData(createDefaultCalendarNodeData()),
      },
      height: {
        default: DEFAULT_HEIGHT,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="calendar"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "calendar" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalendarNodeComponent);
  },

  ...createSafeAtomBlockMarkdownSpec({
    nodeName: "calendar",
    allowedAttributes: ["calendarData", "height"],
    defaultAttributes: {
      calendarData: serializeCalendarNodeData(createDefaultCalendarNodeData()),
      height: DEFAULT_HEIGHT,
    },
  }),

  addCommands() {
    return {
      insertCalendar:
        (calendarData?: Partial<CalendarNodeData>) =>
        ({ commands }) => {
          const nextData = calendarData
            ? serializeCalendarNodeData({
                ...createDefaultCalendarNodeData(),
                ...calendarData,
              })
            : serializeCalendarNodeData(createDefaultCalendarNodeData());

          return commands.insertContent({
            type: this.name,
            attrs: { calendarData: nextData, height: DEFAULT_HEIGHT },
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    calendar: {
      /** Insert a self-contained calendar block. */
      insertCalendar: (calendarData?: Partial<CalendarNodeData>) => ReturnType;
    };
  }
}
