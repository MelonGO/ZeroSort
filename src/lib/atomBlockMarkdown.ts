import type {
  JSONContent,
  MarkdownParseHelpers,
  MarkdownParseResult,
  MarkdownToken,
  MarkdownTokenizer,
} from "@tiptap/core";

interface AtomBlockMarkdownSpecOptions {
  /** The Tiptap node name this spec is for */
  nodeName: string;
  /** Default attributes to apply when parsing */
  defaultAttributes?: Record<string, any>;
  /** Attributes that are allowed to be rendered back to markdown (whitelist) */
  allowedAttributes?: string[];
}

/**
 * Creates a markdown spec for atomic block nodes using multi-line fenced syntax.
 *
 * Unlike `createAtomBlockMarkdownSpec` from `@tiptap/core`, this version stores
 * attributes as a JSON line between `:::blockName` and `:::` fences, which safely
 * handles complex/nested JSON values (chart configs, excalidraw scene data, etc.).
 *
 * Format:
 * ```
 * :::chart
 * {"config":"{\"type\":\"line\",...}","height":500}
 * :::
 * ```
 */
export function createSafeAtomBlockMarkdownSpec(
  options: AtomBlockMarkdownSpecOptions,
): {
  parseMarkdown: (
    token: MarkdownToken,
    h: MarkdownParseHelpers,
  ) => MarkdownParseResult;
  markdownTokenizer: MarkdownTokenizer;
  renderMarkdown: (node: JSONContent) => string;
} {
  const { nodeName, defaultAttributes = {}, allowedAttributes } = options;

  const filterAttributes = (attrs: Record<string, any>) => {
    if (!allowedAttributes) return attrs;

    const filtered: Record<string, any> = {};
    for (const key of allowedAttributes) {
      if (key in attrs) {
        filtered[key] = attrs[key];
      }
    }
    return filtered;
  };

  const startRegex = new RegExp(`^:::${nodeName}\\s*$`, "m");
  const tokenizeRegex = new RegExp(
    `^:::${nodeName}\\s*\\n([\\s\\S]*?)\\n:::(?:\\n|$)`,
  );

  return {
    parseMarkdown: (
      token: MarkdownToken,
      h: MarkdownParseHelpers,
    ): MarkdownParseResult => {
      const attrs = { ...defaultAttributes, ...token.attributes };
      return h.createNode(nodeName, attrs, []);
    },

    markdownTokenizer: {
      name: nodeName,
      level: "block" as const,
      start(src: string) {
        const match = src.match(startRegex);
        return match?.index !== undefined ? match.index : -1;
      },
      tokenize(src) {
        const match = src.match(tokenizeRegex);

        if (!match) return undefined;

        let attributes: Record<string, any> = {};
        const jsonLine = match[1].trim();

        if (jsonLine) {
          try {
            attributes = JSON.parse(jsonLine);
          } catch {
            return undefined;
          }
        }

        return {
          type: nodeName,
          raw: match[0],
          attributes,
        };
      },
    },

    renderMarkdown: (node: JSONContent): string => {
      const filteredAttrs = filterAttributes(node.attrs || {});
      const json = JSON.stringify(filteredAttrs);
      return `:::${nodeName}\n${json}\n:::`;
    },
  };
}
