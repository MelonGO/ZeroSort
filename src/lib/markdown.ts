import { getTiptapExtensions } from "@/components/tiptap/extensions";
import { looksLikeMarkdown } from "@/lib/markdownDetection";
import { tiptapLowlight } from "@/lib/tiptap/lowlight";
import { Editor } from "@tiptap/core";

// Use identical mapping from TiptapEditor to avoid missing nodes/extensions during import/export
const getExtensions = () => getTiptapExtensions({ lowlight: tiptapLowlight });
let markdownImportEditor: Editor | null = null;
let markdownExportEditor: Editor | null = null;

interface TiptapJsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
}

export interface TiptapMarkdownOptions {
  transformImageSource?: (source: string) => string;
}

function getMarkdownImportEditor(): Editor {
  if (!markdownImportEditor) {
    markdownImportEditor = new Editor({
      extensions: getExtensions(),
      content: "",
    });
  }

  return markdownImportEditor;
}

function getMarkdownExportEditor(): Editor {
  if (!markdownExportEditor) {
    markdownExportEditor = new Editor({
      extensions: getExtensions(),
      content: { type: "doc", content: [] },
    });
  }

  return markdownExportEditor;
}

/**
 * Converts a raw Markdown string into TipTap JSON string format.
 */
export function markdownToTiptapJson(markdownContent: string): string {
  // Reuse a single headless editor because constructing extensions per imported
  // file is expensive and can freeze large imports.
  const editor = getMarkdownImportEditor();
  editor.commands.clearContent(true);

  if (looksLikeMarkdown(markdownContent)) {
    const mdManager = editor.markdown;
    if (mdManager) {
      const json = mdManager.parse(markdownContent);
      if (json.content) {
        json.content = json.content.map((node) => {
          if (node.type === "image") {
            return { type: "paragraph", content: [node] };
          }
          return node;
        });
      }
      editor.commands.setContent(json);
    } else {
      editor.commands.insertContent(markdownContent, {
        contentType: "markdown",
      });
    }
  } else {
    editor.commands.insertContent(markdownContent);
  }

  return JSON.stringify(editor.getJSON());
}

/** Rewrites image node sources inside a Tiptap JSON document string. */
export function rewriteTiptapImageSources(
  jsonContent: string,
  transformImageSource: (source: string) => string,
): string {
  const json = JSON.parse(jsonContent) as TiptapJsonNode;
  return JSON.stringify(
    rewriteTiptapNodeImageSources(json, transformImageSource),
  );
}

/**
 * Converts a TipTap JSON string document back into raw Markdown format.
 */
export function tiptapJsonToMarkdown(
  jsonContent: string,
  options?: TiptapMarkdownOptions,
): string {
  if (!jsonContent) return "";

  try {
    const json = JSON.parse(
      options?.transformImageSource
        ? rewriteTiptapImageSources(jsonContent, options.transformImageSource)
        : jsonContent,
    );
    const editor = getMarkdownExportEditor();
    editor.commands.setContent(json);

    // The tiptap-markdown extension injects `getMarkdown()` into the editor instance
    const markdown = editor.getMarkdown();

    return markdown;
  } catch (err) {
    console.error("Failed to parse tiptap JSON to markdown", err);
    return "";
  }
}

function rewriteTiptapNodeImageSources(
  node: TiptapJsonNode,
  transformImageSource: (source: string) => string,
): TiptapJsonNode {
  const nextNode: TiptapJsonNode = {
    ...node,
    attrs: node.attrs ? { ...node.attrs } : undefined,
  };

  if (node.type === "image" && typeof node.attrs?.src === "string") {
    nextNode.attrs = {
      ...nextNode.attrs,
      src: transformImageSource(node.attrs.src),
    };
  }

  if (node.content) {
    nextNode.content = node.content.map((childNode) =>
      rewriteTiptapNodeImageSources(childNode, transformImageSource),
    );
  }

  return nextNode;
}
