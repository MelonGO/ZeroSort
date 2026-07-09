import { getHeavyTiptapExtensions } from "@/components/tiptap/heavyExtensions";
import { WikiLink } from "@/components/tiptap/WikiLinkNode";
import { createWikiLinkSuggestion } from "@/components/tiptap/WikiLinkSuggestion";
import { openExternal } from "@/lib/desktop-adapter";
import { resolveManagedImageSrc } from "@/lib/images";
import { looksLikeMarkdown } from "@/lib/markdownDetection";
import type { Note } from "@/types";
import { Extension, type AnyExtension, type JSONContent } from "@tiptap/core";
import BulletList from "@tiptap/extension-bullet-list";
import CharacterCountExtension from "@tiptap/extension-character-count";
import Code from "@tiptap/extension-code";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Color } from "@tiptap/extension-color";
import { Highlight as TiptapHighlight } from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import { Mathematics } from "@tiptap/extension-mathematics";
import OrderedList from "@tiptap/extension-ordered-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import { Selection } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

type TiptapJsonNode = JSONContent;

const inlineNodeTypes = new Set(["text", "image", "inlineMath", "hardBreak"]);
const listItemNodeTypes = new Set(["listItem", "taskItem"]);
const externalLinkProtocols = new Set(["http:", "https:"]);

function normalizeExternalLinkHref(href: string): string | null {
  try {
    const url = new URL(href.includes(":") ? href : `https://${href}`);

    if (!externalLinkProtocols.has(url.protocol)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

const ExternalLinkClickHandler = Extension.create({
  name: "externalLinkClickHandler",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("externalLinkClickHandler"),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement | null;
            const clickedImage = target?.closest?.("img");

            if (clickedImage) {
              return false;
            }

            const linkElement = target?.closest?.("a[href]");
            const href = linkElement?.getAttribute("href");

            if (!href) {
              return false;
            }

            const normalizedHref = normalizeExternalLinkHref(href);

            if (!normalizedHref) {
              return false;
            }

            event.preventDefault();
            void openExternal(normalizedHref);
            return true;
          },
        },
      }),
    ];
  },
});

function isInlineTiptapNode(node: TiptapJsonNode): boolean {
  if (!node.type) {
    return false;
  }

  if (inlineNodeTypes.has(node.type)) {
    return true;
  }

  return typeof node.text === "string" || Array.isArray(node.marks);
}

function wrapInlineListItemChildren(
  content: TiptapJsonNode[],
): TiptapJsonNode[] {
  const normalizedContent: TiptapJsonNode[] = [];
  let paragraphBuffer: TiptapJsonNode[] = [];

  const flushParagraphBuffer = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }

    normalizedContent.push({
      type: "paragraph",
      content: paragraphBuffer,
    });
    paragraphBuffer = [];
  };

  for (const child of content) {
    if (isInlineTiptapNode(child)) {
      paragraphBuffer.push(child);
      continue;
    }

    flushParagraphBuffer();
    normalizedContent.push(child);
  }

  flushParagraphBuffer();

  return normalizedContent;
}

function normalizeMarkdownJsonNode(node: TiptapJsonNode): TiptapJsonNode {
  // 1. Shallow copy the node
  const normalizedNode: TiptapJsonNode = { ...node };

  // 2. Safely handle attrs: only assign if there is actual content, otherwise delete the key (to prevent polluting nodes like Text that do not allow attrs)
  if (node.attrs && Object.keys(node.attrs).length > 0) {
    normalizedNode.attrs = { ...node.attrs };
  } else {
    delete normalizedNode.attrs;
  }

  // 3. If there is no content (e.g., text nodes), return early
  if (!node.content) {
    return normalizedNode;
  }

  // 4. Recursively normalize child nodes
  const normalizedContent = node.content.map(normalizeMarkdownJsonNode);

  // 5. Handle special list logic
  normalizedNode.content = listItemNodeTypes.has(node.type || "")
    ? wrapInlineListItemChildren(normalizedContent)
    : normalizedContent;

  return normalizedNode;
}

/** Extension that converts pasted Markdown plain-text into rich Tiptap content. */
export const PasteMarkdown = Extension.create({
  name: "pasteMarkdown",

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: new PluginKey("pasteMarkdown"),
        props: {
          handlePaste(_view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            const html = clipboardData.getData("text/html");
            if (html) return false;

            const text = clipboardData.getData("text/plain");
            if (!text) return false;

            if (looksLikeMarkdown(text)) {
              const mdManager = editor.markdown;
              if (mdManager) {
                const json = normalizeMarkdownJsonNode(mdManager.parse(text));
                if (json.content) {
                  json.content = json.content.map((node) => {
                    if (node.type === "image") {
                      return { type: "paragraph", content: [node] };
                    }
                    return node;
                  });
                }
                editor.commands.insertContent(json);
              } else {
                editor.commands.insertContent(text, {
                  contentType: "markdown",
                });
              }
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

export interface TiptapExtensionsOptions {
  placeholder?: string;
  lowlight?: any;
  onInlineMathClick?: (node: any, pos: number) => void;
  onBlockMathClick?: (node: any, pos: number) => void;
  onImageClick?: (pos: number, attrs: Record<string, any>) => void;
  onWikiLinkClick?: (noteTitle: string, displayText?: string) => void;
  fetchNotes?: () => Promise<Note[]>;
}

export function getBaseTiptapExtensions(
  options: TiptapExtensionsOptions,
): AnyExtension[] {
  return [
    Markdown,
    PasteMarkdown,
    Typography,
    Selection.configure({
      className: "selection",
    }),
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          display: {
            default: "block",
            parseHTML: (element) =>
              element.getAttribute("data-display") || "block",
            renderHTML: (attributes) => {
              return { "data-display": attributes.display || "block" };
            },
          },
        };
      },
      addNodeView() {
        // Override to sync data-display onto the wrapper DOM
        const parentNodeView = this.parent?.bind(this)?.();
        if (!parentNodeView) return null;

        return (props: any) => {
          const nodeView = (parentNodeView as Function)(props);
          let container = nodeView.dom as HTMLElement | null;
          let syncRequestId = 0;
          let destroyed = false;

          const syncImageElement = (node: any) => {
            syncRequestId += 1;
            const requestId = syncRequestId;
            const imageSrc = node.attrs.src || "";

            void resolveManagedImageSrc(imageSrc)
              .then((resolvedSrc) => {
                if (destroyed || requestId !== syncRequestId) {
                  return;
                }

                const innerImg = container?.querySelector?.("img");
                if (innerImg) {
                  if (resolvedSrc) {
                    innerImg.setAttribute("src", resolvedSrc);
                  } else {
                    innerImg.removeAttribute("src");
                  }
                }
              })
              .catch(() => {
                if (destroyed || requestId !== syncRequestId) {
                  return;
                }

                const innerImg = container?.querySelector?.("img");
                if (innerImg) {
                  if (imageSrc) {
                    innerImg.setAttribute("src", imageSrc);
                  } else {
                    innerImg.removeAttribute("src");
                  }
                }
              });
          };

          const displayVal = props.node.attrs.display || "block";
          if (container && container.setAttribute) {
            container.setAttribute("data-display", displayVal);
          }
          syncImageElement(props.node);

          let originalUpdate = nodeView.update?.bind(nodeView);
          nodeView.update = (
            updatedNode: any,
            decorations: any,
            innerDecorations: any,
          ) => {
            const result = originalUpdate?.(
              updatedNode,
              decorations,
              innerDecorations,
            );
            if (result !== false) {
              const newDisplay = updatedNode.attrs.display || "block";
              if (container && container.setAttribute) {
                container.setAttribute("data-display", newDisplay);
              }

              syncImageElement(updatedNode);

              const innerImg = container?.querySelector?.("img");
              if (innerImg) {
                if (updatedNode.attrs.alt != null) {
                  innerImg.setAttribute("alt", updatedNode.attrs.alt);
                } else {
                  innerImg.removeAttribute("alt");
                }
              }
            }
            return result;
          };

          const originalDestroy = nodeView.destroy?.bind(nodeView);
          nodeView.destroy = () => {
            destroyed = true;
            container = null;
            originalUpdate = null;
            originalDestroy?.();
          };

          return nodeView;
        };
      },
      addProseMirrorPlugins() {
        const parentPlugins = this.parent?.() || [];
        return [
          ...parentPlugins,
          new Plugin({
            key: new PluginKey("imageClickHandler"),
            props: {
              handleClick(view, pos, event) {
                const target = event.target as HTMLElement;
                if (target.tagName === "IMG") {
                  const $pos = view.state.doc.resolve(pos);
                  const nodeAfter = $pos.nodeAfter;
                  const nodeBefore = $pos.nodeBefore;
                  const node =
                    nodeAfter?.type.name === "image" ? nodeAfter : nodeBefore;
                  const imagePos =
                    nodeAfter?.type.name === "image"
                      ? pos
                      : pos - (node?.nodeSize || 0);

                  if (node?.type.name === "image") {
                    options.onImageClick?.(imagePos, node.attrs);
                    return true;
                  }
                }
                return false;
              },
            },
          }),
        ];
      },
    }).configure({
      resize: {
        enabled: true,
        alwaysPreserveAspectRatio: true,
      },
      allowBase64: true,
      inline: true,
    }),
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      underline: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    // Explicit list configuration with keyboard shortcuts for nesting
    BulletList,
    OrderedList,
    ListItem,
    Code.extend({
      excludes: "",
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Underline,
    TextStyle,
    TiptapHighlight.configure({ multicolor: true }),
    Color,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      protocols: ["http", "https"],
      isAllowedUri: (url, ctx) => {
        try {
          const parsedUrl = url.includes(":")
            ? new URL(url)
            : new URL(`${ctx.defaultProtocol}://${url}`);
          if (!ctx.defaultValidate(parsedUrl.href)) return false;
          const disallowedProtocols = ["ftp", "file", "mailto"];
          const protocol = parsedUrl.protocol.replace(":", "");
          if (disallowedProtocols.includes(protocol)) return false;
          const allowedProtocols = ctx.protocols.map((p: any) =>
            typeof p === "string" ? p : p.scheme,
          );
          if (!allowedProtocols.includes(protocol)) return false;
          return true;
        } catch {
          return false;
        }
      },
    }),
    ExternalLinkClickHandler,
    Placeholder.configure({
      placeholder: options.placeholder || "",
    }),
    ...(options.lowlight
      ? [
          CodeBlockLowlight.configure({
            lowlight: options.lowlight,
            enableTabIndentation: true,
            tabSize: 2,
          }),
        ]
      : []),
    Mathematics.configure({
      inlineOptions: {
        onClick: options.onInlineMathClick,
      },
      blockOptions: {
        onClick: options.onBlockMathClick,
      },
    }),
    WikiLink.configure({
      onLinkClick: options.onWikiLinkClick,
      suggestion: options.fetchNotes
        ? createWikiLinkSuggestion(options.fetchNotes)
        : undefined,
    }),
    CharacterCountExtension,
  ];
}

export function getTiptapExtensions(options: TiptapExtensionsOptions) {
  return [...getBaseTiptapExtensions(options), ...getHeavyTiptapExtensions()];
}
