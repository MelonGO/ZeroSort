import { getTiptapExtensions } from "@/components/tiptap/extensions";
import { tiptapLowlight } from "@/lib/tiptap/lowlight";
import { Editor } from "@tiptap/core";

let headlessEditor: Editor | null = null;

/** Returns a reusable headless Tiptap editor instance for JSON-to-Markdown conversion. */
function getHeadlessEditor(): Editor {
  if (!headlessEditor) {
    headlessEditor = new Editor({
      extensions: getTiptapExtensions({ lowlight: tiptapLowlight }),
      content: { type: "doc", content: [] },
    });
  }
  return headlessEditor;
}

/** Converts a Tiptap JSON string to Markdown using the same extensions as the editor. */
export function tiptapJsonToMarkdown(json: string): string {
  try {
    const doc = JSON.parse(json);
    const editor = getHeadlessEditor();
    editor.commands.setContent(doc);
    return editor.getMarkdown();
  } catch {
    return "";
  }
}
