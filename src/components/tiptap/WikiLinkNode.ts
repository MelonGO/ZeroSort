import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { SuggestionOptions } from "@tiptap/suggestion";
import Suggestion from "@tiptap/suggestion";

const wikiLinkMarkdownRegex = /^\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/;

export interface WikiLinkOptions {
  /** HTML attributes to apply to the wiki link element */
  HTMLAttributes: Record<string, any>;
  /** Callback when a wiki link is clicked */
  onLinkClick?: (noteTitle: string, displayText?: string) => void;
  /** Suggestion configuration for autocomplete */
  suggestion?: Omit<SuggestionOptions, "editor">;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      /**
       * Insert a wiki link at the current cursor position
       */
      insertWikiLink: (noteTitle: string, displayText?: string) => ReturnType;
    };
  }
}

/**
 * WikiLink extension for Tiptap editor.
 * Renders [[Note Title]] and [[Note Title|Display]] syntax as clickable links.
 */
export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",

  group: "inline",

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onLinkClick: undefined,
      suggestion: undefined,
    };
  },

  addAttributes() {
    return {
      noteTitle: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-note-title"),
        renderHTML: (attributes) => ({
          "data-note-title": attributes.noteTitle,
        }),
      },
      displayText: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-display-text"),
        renderHTML: (attributes) => {
          if (!attributes.displayText) return {};
          return {
            "data-display-text": attributes.displayText,
          };
        },
      },
      isBroken: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-broken") === "true",
        renderHTML: (attributes) => {
          if (!attributes.isBroken) return {};
          return {
            "data-broken": "true",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const displayText =
      node.attrs.displayText || node.attrs.noteTitle || "[[]]";
    const isBroken = node.attrs.isBroken;

    return [
      "span",
      mergeAttributes(
        {
          "data-wiki-link": "",
          class: isBroken
            ? "wiki-link wiki-link-broken"
            : "wiki-link wiki-link-valid",
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      displayText,
    ];
  },

  renderText({ node }) {
    const noteTitle = node.attrs.noteTitle || "";
    const displayText = node.attrs.displayText;

    if (displayText) {
      return `[[${noteTitle}|${displayText}]]`;
    }
    return `[[${noteTitle}]]`;
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("wikiLink", {
      noteTitle: token.noteTitle,
      displayText: token.displayText || null,
      isBroken: false,
    });
  },

  renderMarkdown(node) {
    const noteTitle = node.attrs?.noteTitle || "";
    const displayText = node.attrs?.displayText;

    if (!noteTitle) {
      return "";
    }

    return displayText ? `[[${noteTitle}|${displayText}]]` : `[[${noteTitle}]]`;
  },

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start(src) {
      return src.indexOf("[[");
    },
    tokenize(src) {
      const match = wikiLinkMarkdownRegex.exec(src);

      if (!match) {
        return undefined;
      }

      const noteTitle = match[1].trim();
      const displayText = match[2]?.trim();

      if (!noteTitle) {
        return undefined;
      }

      return {
        type: "wikiLink",
        raw: match[0],
        noteTitle,
        displayText,
      };
    },
  },

  addCommands() {
    return {
      insertWikiLink:
        (noteTitle: string, displayText?: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              noteTitle,
              displayText,
              isBroken: false,
            },
          });
        },
    };
  },

  addProseMirrorPlugins() {
    const { onLinkClick, suggestion } = this.options;

    const plugins = [
      new Plugin({
        key: new PluginKey("wikiLinkClick"),
        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement;

            // Check if clicked element is a wiki link
            if (target.hasAttribute("data-wiki-link")) {
              const noteTitle = target.getAttribute("data-note-title");
              const displayText = target.getAttribute("data-display-text");

              if (noteTitle && onLinkClick) {
                event.preventDefault();
                onLinkClick(noteTitle, displayText || undefined);
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];

    // Add suggestion plugin if configured
    if (suggestion) {
      plugins.push(
        Suggestion({
          editor: this.editor,
          ...suggestion,
        }),
      );
    }

    return plugins;
  },
});

/**
 * Plugin to automatically convert [[...]] syntax to WikiLink nodes in real-time.
 */
export function createWikiLinkInputRule() {
  return new Plugin({
    key: new PluginKey("wikiLinkInputRule"),
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const { doc } = state;

        doc.descendants((node, pos) => {
          if (node.isText && node.text) {
            const text = node.text;
            // Match [[text]] or [[text|display]]
            const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
            let match;

            while ((match = regex.exec(text)) !== null) {
              const from = pos + match.index;
              const to = from + match[0].length;

              decorations.push(
                Decoration.inline(from, to, {
                  class: "wiki-link-preview",
                }),
              );
            }
          }
        });

        return DecorationSet.create(doc, decorations);
      },
    },
  });
}
