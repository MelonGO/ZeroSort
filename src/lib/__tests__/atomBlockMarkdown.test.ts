/**
 * Tests for the atomBlockMarkdown module - Safe markdown serialization
 * for custom Tiptap nodes with complex JSON attribute values.
 */
import { describe, expect, it } from "vitest";

import { createSafeAtomBlockMarkdownSpec } from "@/lib/atomBlockMarkdown";
import { looksLikeMarkdown } from "@/lib/markdownDetection";

describe("createSafeAtomBlockMarkdownSpec - renderMarkdown", () => {
  const spec = createSafeAtomBlockMarkdownSpec({
    nodeName: "chart",
    allowedAttributes: ["config", "height"],
    defaultAttributes: { height: 500 },
  });

  it("Should render a simple node to fenced markdown", () => {
    const result = spec.renderMarkdown({
      type: "chart",
      attrs: { config: '{"type":"line"}', height: 500 },
    });
    expect(result).toBe(
      ':::chart\n{"config":"{\\"type\\":\\"line\\"}","height":500}\n:::',
    );
  });

  it("Should filter attributes via allowedAttributes", () => {
    const result = spec.renderMarkdown({
      type: "chart",
      attrs: { config: '{"type":"bar"}', height: 300, extra: "ignored" },
    });
    const parsed = JSON.parse(result.split("\n")[1]);
    expect(parsed).toEqual({ config: '{"type":"bar"}', height: 300 });
    expect(parsed.extra).toBeUndefined();
  });

  it("Should handle empty attrs", () => {
    const result = spec.renderMarkdown({ type: "chart" });
    expect(result).toBe(":::chart\n{}\n:::");
  });

  it("Should handle deeply nested JSON config", () => {
    const config = JSON.stringify({
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar"],
        datasets: [
          {
            label: 'Revenue ("$")',
            data: [100, 200, 300],
            borderColor: "rgb(75, 192, 192)",
          },
        ],
      },
      options: { scales: { y: { beginAtZero: true } } },
    });

    const result = spec.renderMarkdown({
      type: "chart",
      attrs: { config, height: 400 },
    });

    // Parse it back and verify the config is intact
    const jsonLine = result.split("\n")[1];
    const attrs = JSON.parse(jsonLine);
    const parsedConfig = JSON.parse(attrs.config);
    expect(parsedConfig.data.datasets[0].label).toBe('Revenue ("$")');
    expect(parsedConfig.data.labels).toEqual(["Jan", "Feb", "Mar"]);
  });
});

describe("createSafeAtomBlockMarkdownSpec - tokenizer", () => {
  const spec = createSafeAtomBlockMarkdownSpec({
    nodeName: "chart",
    allowedAttributes: ["config", "height"],
    defaultAttributes: { height: 500 },
  });

  it("Should detect start of a chart block", () => {
    const src = "Some text\n:::chart\n{}\n:::";
    const startFn = spec.markdownTokenizer.start as (src: string) => number;
    expect(startFn(src)).toBe(10);
  });

  it("Should return -1 when no block found", () => {
    const src = "Just regular text without blocks";
    const startFn = spec.markdownTokenizer.start as (src: string) => number;
    expect(startFn(src)).toBe(-1);
  });

  it("Should tokenize a simple block", () => {
    const src = ':::chart\n{"config":"test","height":300}\n:::\n';
    const result = spec.markdownTokenizer.tokenize(src, [], {} as any);
    expect(result).toBeDefined();
    expect(result!.type).toBe("chart");
    expect(result!.attributes).toEqual({ config: "test", height: 300 });
  });

  it("Should tokenize a block with deeply nested JSON", () => {
    const config = JSON.stringify({
      type: "line",
      data: { labels: ["A", "B"], datasets: [{ data: [1, 2] }] },
    });
    const attrs = JSON.stringify({ config, height: 500 });
    const src = `:::chart\n${attrs}\n:::\n`;
    const result = spec.markdownTokenizer.tokenize(src, [], {} as any);

    expect(result).toBeDefined();
    const parsedConfig = JSON.parse(result!.attributes.config);
    expect(parsedConfig.type).toBe("line");
    expect(parsedConfig.data.datasets[0].data).toEqual([1, 2]);
  });

  it("Should return undefined for invalid JSON", () => {
    const src = ":::chart\n{invalid json}\n:::\n";
    const result = spec.markdownTokenizer.tokenize(src, [], {} as any);
    expect(result).toBeUndefined();
  });

  it("Should return undefined for non-matching block", () => {
    const src = ":::markmap\n{}\n:::\n";
    const result = spec.markdownTokenizer.tokenize(src, [], {} as any);
    expect(result).toBeUndefined();
  });

  it("Should consume the raw match including trailing newline", () => {
    const src = ':::chart\n{"height":500}\n:::\nMore text';
    const result = spec.markdownTokenizer.tokenize(src, [], {} as any);
    expect(result).toBeDefined();
    expect(result!.raw).toBe(':::chart\n{"height":500}\n:::\n');
  });
});

describe("createSafeAtomBlockMarkdownSpec - parseMarkdown", () => {
  const spec = createSafeAtomBlockMarkdownSpec({
    nodeName: "chart",
    allowedAttributes: ["config", "height"],
    defaultAttributes: { height: 500 },
  });

  it("Should apply default attributes when not provided in token", () => {
    const mockHelpers = {
      createNode: (name: string, attrs: any, content: any) => ({
        type: name,
        attrs,
        content,
      }),
    };

    const token = { attributes: { config: "test" } } as any;
    const result = spec.parseMarkdown(token, mockHelpers as any);
    expect(result).toEqual({
      type: "chart",
      attrs: { height: 500, config: "test" },
      content: [],
    });
  });

  it("Should allow token attributes to override defaults", () => {
    const mockHelpers = {
      createNode: (name: string, attrs: any, content: any) => ({
        type: name,
        attrs,
        content,
      }),
    };

    const token = { attributes: { config: "test", height: 300 } } as any;
    const result = spec.parseMarkdown(token, mockHelpers as any);
    expect(result).toEqual({
      type: "chart",
      attrs: { height: 300, config: "test" },
      content: [],
    });
  });
});

describe("Round-trip serialization", () => {
  it("Should round-trip chart config with complex JSON", () => {
    const spec = createSafeAtomBlockMarkdownSpec({
      nodeName: "chart",
      allowedAttributes: ["config", "height"],
      defaultAttributes: { height: 500 },
    });

    const originalConfig = JSON.stringify({
      type: "bar",
      data: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        datasets: [
          {
            label: 'Sales "2024"',
            data: [12, 19, 3, 5],
            backgroundColor: ["rgba(255,99,132,0.2)"],
          },
        ],
      },
      options: {
        plugins: { title: { display: true, text: 'Chart with "quotes"' } },
      },
    });

    const node = {
      type: "chart",
      attrs: { config: originalConfig, height: 400 },
    };

    // Render to markdown
    const markdown = spec.renderMarkdown(node);

    // Parse back from markdown
    const tokenResult = spec.markdownTokenizer.tokenize(
      markdown + "\n",
      [],
      {} as any,
    );
    expect(tokenResult).toBeDefined();

    // Verify round-trip
    expect(tokenResult!.attributes.config).toBe(originalConfig);
    expect(tokenResult!.attributes.height).toBe(400);
  });

  it("Should round-trip markmap content with markdown syntax", () => {
    const spec = createSafeAtomBlockMarkdownSpec({
      nodeName: "markmap",
      allowedAttributes: ["content", "height"],
      defaultAttributes: { height: 300 },
    });

    const markmapContent =
      '# Root\n- **Bold** item\n- `code` item\n- [Link](http://example.com)\n  - Sub-item with "quotes"\n  - Sub-item with :::colons:::';

    const node = {
      type: "markmap",
      attrs: { content: markmapContent, height: 350 },
    };

    const markdown = spec.renderMarkdown(node);
    const tokenResult = spec.markdownTokenizer.tokenize(
      markdown + "\n",
      [],
      {} as any,
    );

    expect(tokenResult).toBeDefined();
    expect(tokenResult!.attributes.content).toBe(markmapContent);
    expect(tokenResult!.attributes.height).toBe(350);
  });

  it("Should round-trip excalidraw scene data with elements and files", () => {
    const spec = createSafeAtomBlockMarkdownSpec({
      nodeName: "excalidraw",
      allowedAttributes: ["sceneData", "height"],
      defaultAttributes: { height: 500 },
    });

    const sceneData = JSON.stringify({
      elements: [
        {
          id: "abc123",
          type: "rectangle",
          x: 100,
          y: 200,
          width: 300,
          height: 150,
          strokeColor: "#000000",
          text: 'Label with "quotes" and\nnewlines',
        },
        {
          id: "def456",
          type: "text",
          text: "Hello :::world:::",
          fileId: "file1",
        },
      ],
      appState: { viewBackgroundColor: "#ffffff", gridSize: 20 },
      files: {
        file1: { mimeType: "image/png", dataURL: "data:image/png;base64,..." },
      },
    });

    const node = {
      type: "excalidraw",
      attrs: { sceneData, height: 600 },
    };

    const markdown = spec.renderMarkdown(node);
    const tokenResult = spec.markdownTokenizer.tokenize(
      markdown + "\n",
      [],
      {} as any,
    );

    expect(tokenResult).toBeDefined();
    expect(tokenResult!.attributes.sceneData).toBe(sceneData);
    expect(tokenResult!.attributes.height).toBe(600);

    // Verify the inner JSON is intact
    const parsed = JSON.parse(tokenResult!.attributes.sceneData);
    expect(parsed.elements).toHaveLength(2);
    expect(parsed.elements[0].text).toBe('Label with "quotes" and\nnewlines');
    expect(parsed.elements[1].text).toBe("Hello :::world:::");
    expect(parsed.files.file1.mimeType).toBe("image/png");
  });

  it("Should round-trip with default height when omitted", () => {
    const spec = createSafeAtomBlockMarkdownSpec({
      nodeName: "chart",
      allowedAttributes: ["config", "height"],
      defaultAttributes: { height: 500 },
    });

    const node = {
      type: "chart",
      attrs: { config: '{"type":"pie"}', height: 500 },
    };

    const markdown = spec.renderMarkdown(node);
    const tokenResult = spec.markdownTokenizer.tokenize(
      markdown + "\n",
      [],
      {} as any,
    );

    expect(tokenResult).toBeDefined();

    // Simulate parseMarkdown applying defaults
    const mockHelpers = {
      createNode: (_: string, attrs: any, content: any) => ({
        attrs,
        content,
      }),
    };
    const parsed = spec.parseMarkdown(
      tokenResult as any,
      mockHelpers as any,
    ) as any;
    expect(parsed.attrs.height).toBe(500);
  });

  it("Should handle empty string attribute values", () => {
    const spec = createSafeAtomBlockMarkdownSpec({
      nodeName: "excalidraw",
      allowedAttributes: ["sceneData", "height"],
      defaultAttributes: { height: 500 },
    });

    const node = {
      type: "excalidraw",
      attrs: { sceneData: "", height: 500 },
    };

    const markdown = spec.renderMarkdown(node);
    const tokenResult = spec.markdownTokenizer.tokenize(
      markdown + "\n",
      [],
      {} as any,
    );

    expect(tokenResult).toBeDefined();
    expect(tokenResult!.attributes.sceneData).toBe("");
  });
});

describe("looksLikeMarkdown - ::: fence detection", () => {
  it("Should detect ::: fenced blocks", () => {
    expect(looksLikeMarkdown(":::chart\n{}\n:::")).toBe(true);
    expect(looksLikeMarkdown(":::markmap\n{}\n:::")).toBe(true);
    expect(looksLikeMarkdown(":::excalidraw\n{}\n:::")).toBe(true);
  });

  it("Should still detect standard markdown", () => {
    expect(looksLikeMarkdown("# Heading")).toBe(true);
    expect(looksLikeMarkdown("**bold**")).toBe(true);
    expect(looksLikeMarkdown("```code```")).toBe(true);
  });

  it("Should not detect plain text", () => {
    expect(looksLikeMarkdown("Hello world")).toBe(false);
    expect(looksLikeMarkdown("Just some text")).toBe(false);
  });

  it("Should detect inline and block math markdown", () => {
    expect(looksLikeMarkdown("$E=mc^2$")).toBe(true);
    expect(looksLikeMarkdown("Here is inline math $a+b$ inside text")).toBe(
      true,
    );
    expect(looksLikeMarkdown("$$\\int_0^1 x^2 dx$$")).toBe(true);
    expect(looksLikeMarkdown("Before\n$$x^2 + y^2 = z^2$$\nAfter")).toBe(true);
  });

  it("Should not treat plain dollar text as markdown math", () => {
    expect(looksLikeMarkdown("Price is $5")).toBe(false);
    expect(looksLikeMarkdown("Budget: $100 USD")).toBe(false);
    expect(looksLikeMarkdown("$unfinished math")).toBe(false);
  });
});
