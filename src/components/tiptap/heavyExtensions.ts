import { CalendarNode } from "@/components/tiptap/CalendarNode";
import { ChartNode } from "@/components/tiptap/ChartNode";
import { ExcalidrawNode } from "@/components/tiptap/ExcalidrawNode";
import { KanbanNode } from "@/components/tiptap/KanbanNode";
import { MarkmapNode } from "@/components/tiptap/MarkmapNode";
import { MermaidNode } from "@/components/tiptap/MermaidNode";

/** Returns the heavier block extensions so they can be grouped separately. */
export function getHeavyTiptapExtensions() {
  return [
    MarkmapNode,
    ChartNode,
    MermaidNode,
    ExcalidrawNode,
    CalendarNode,
    KanbanNode,
  ];
}
