import type { Note } from "@/types";
import type { JSONContent } from "@tiptap/core";

export const INITIAL_EXAMPLE_NOTE_STORAGE_KEY = "initialExampleNote.created";
export const INITIAL_EXAMPLE_NOTE_CATALOG = ["ZeroSort", "Getting Started"];

const INITIAL_EXAMPLE_NOTE_TITLE = "Welcome to ZeroSort";
const INITIAL_EXAMPLE_NOTE_SUMMARY =
  "A quick tour note showing rich editing, AI-assisted organization, local-first storage, wiki links, diagrams, charts, tables, code, math, and sync-ready workflows.";

const paragraph = (content: JSONContent["content"]): JSONContent => ({
  type: "paragraph",
  content,
});

const text = (value: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

const heading = (level: number, value: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [text(value)],
});

const listItem = (value: string): JSONContent => ({
  type: "listItem",
  content: [paragraph([text(value)])],
});

const taskItem = (value: string, checked = false): JSONContent => ({
  type: "taskItem",
  attrs: { checked },
  content: [paragraph([text(value)])],
});

const tableCell = (value: string, type = "tableCell"): JSONContent => ({
  type,
  content: [paragraph([text(value)])],
});

const initialExampleNoteDoc: JSONContent = {
  type: "doc",
  content: [
    heading(1, "Welcome to ZeroSort"),
    paragraph([
      text(
        "ZeroSort is a local-first note workspace for capturing messy ideas, then letting structure emerge. ",
      ),
      text("This note is editable", [{ type: "bold" }]),
      text(": rewrite it, delete it, or use it as a tiny playground."),
    ]),
    paragraph([
      text(
        "Try selecting this sentence to ask AI for a summary, rewrite, translation, chart, mind map, or Mermaid diagram. ",
      ),
      text(
        "AI can also regenerate the title, summary, folder, and tags from the note content when a model is configured.",
        [{ type: "highlight", attrs: { color: "#fef08a" } }],
      ),
    ]),
    heading(2, "Capture without sorting first"),
    {
      type: "taskList",
      content: [
        taskItem("Drop a thought here before you know where it belongs.", true),
        taskItem(
          "Use headings, lists, tables, code, math, and links in one note.",
          true,
        ),
        taskItem(
          "Regenerate the folder and tags when the note has enough context.",
        ),
      ],
    },
    {
      type: "bulletList",
      content: [
        listItem("Folders can be created manually or suggested by AI."),
        listItem(
          "Tags help cross-cut topics that do not fit neatly into one folder.",
        ),
        listItem(
          "Open several notes in tabs when one idea turns into several threads.",
        ),
      ],
    },
    heading(2, "Rich text that survives real work"),
    paragraph([
      text("Use "),
      text("bold", [{ type: "bold" }]),
      text(", "),
      text("italic", [{ type: "italic" }]),
      text(", "),
      text("underline", [{ type: "underline" }]),
      text(", "),
      text("inline code", [{ type: "code" }]),
      text(", "),
      text("colored text", [
        { type: "textStyle", attrs: { color: "#2563eb" } },
      ]),
      text(", highlights, and safe external links like "),
      text("this reference", [
        {
          type: "link",
          attrs: {
            href: "https://www.markdownguide.org",
            target: "_blank",
            rel: "noopener noreferrer nofollow",
            class: null,
          },
        },
      ]),
      text("."),
    ]),
    {
      type: "blockquote",
      content: [
        paragraph([
          text(
            "Good notes are allowed to start vague. ZeroSort is built for the moment before categories exist.",
          ),
        ]),
      ],
    },
    heading(3, "Wiki links"),
    paragraph([
      text("Create connections with wiki links such as "),
      {
        type: "wikiLink",
        attrs: {
          noteTitle: "Project Hub",
          displayText: "Project Hub",
          isBroken: false,
        },
      },
      text(" or type [[ to search existing notes."),
    ]),
    heading(3, "Tables"),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            tableCell("Feature", "tableHeader"),
            tableCell("What to try", "tableHeader"),
            tableCell("Why it matters", "tableHeader"),
          ],
        },
        {
          type: "tableRow",
          content: [
            tableCell("Editor"),
            tableCell("Paste Markdown or drag in an image"),
            tableCell("Capture from anywhere without cleanup first"),
          ],
        },
        {
          type: "tableRow",
          content: [
            tableCell("AI"),
            tableCell("Select text and open the AI menu"),
            tableCell(
              "Turn rough notes into summaries, diagrams, and structure",
            ),
          ],
        },
        {
          type: "tableRow",
          content: [
            tableCell("Sync"),
            tableCell("Configure S3 in settings"),
            tableCell("Keep local notes portable across your machines"),
          ],
        },
      ],
    },
    heading(2, "Code and math"),
    {
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [
        text(
          'type InboxNote = {\n  title: string;\n  content: string;\n  tags: string[];\n};\n\nasync function organize(note: InboxNote) {\n  return await ai.regenerate(["title", "summary", "catalog", "tags"], note.content);\n}',
        ),
      ],
    },
    paragraph([
      text("Inline math works too: "),
      { type: "inlineMath", attrs: { latex: "E = mc^2" } },
      text(". Double-click or click math blocks to edit them."),
    ]),
    {
      type: "blockMath",
      attrs: {
        latex:
          "\\text{signal} = \\frac{\\text{captured ideas}}{\\text{friction}}",
      },
    },
    heading(2, "Visual blocks"),
    paragraph([
      text(
        "ZeroSort can store structured visual blocks directly inside a note.",
      ),
    ]),
    {
      type: "markmap",
      attrs: {
        content:
          "# ZeroSort\n## Capture\n- Rich text\n- Markdown paste\n- Images\n## Organize\n- AI folders\n- Tags\n- Wiki links\n## Preserve\n- SQLite local storage\n- S3 sync\n- Export",
        height: 320,
      },
    },
    {
      type: "chart",
      attrs: {
        config: JSON.stringify({
          type: "bar",
          data: {
            labels: ["Capture", "Organize", "Review", "Sync"],
            datasets: [
              {
                label: "Example workflow",
                data: [8, 5, 3, 4],
              },
            ],
          },
        }),
        height: 320,
      },
    },
    {
      type: "mermaidDiagram",
      attrs: {
        content:
          "flowchart LR\n  A[Quick note] --> B[AI summary]\n  B --> C[Suggested folder]\n  B --> D[Tags]\n  C --> E[Searchable archive]\n  D --> E\n  E --> F[S3 sync]",
        height: 320,
      },
    },
    { type: "horizontalRule" },
    heading(2, "Make it yours"),
    {
      type: "orderedList",
      content: [
        listItem("Edit this note until it reflects the way you think."),
        listItem("Create a second note and link it with [[Project Hub]]."),
        listItem(
          "When you are ready, delete this tour. ZeroSort will not recreate it.",
        ),
      ],
    },
  ],
};

/** Builds the bundled first-run example note. */
export function buildInitialExampleNote(id: string, timestamp: string): Note {
  return {
    id,
    title: INITIAL_EXAMPLE_NOTE_TITLE,
    summary: INITIAL_EXAMPLE_NOTE_SUMMARY,
    content: JSON.stringify(initialExampleNoteDoc),
    directoryId: null,
    tagIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    isContentLoaded: true,
  };
}
