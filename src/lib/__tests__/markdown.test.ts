// @vitest-environment jsdom

/**
 * Tests for the markdown helpers - managed image source rewriting and markdown parsing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadMarkdownModule() {
  return await import("@/lib/markdown");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rewriteTiptapImageSources - managed image path replacement", () => {
  it("Should rewrite managed image sources with the provided mapper", async () => {
    const { rewriteTiptapImageSources } = await loadMarkdownModule();
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "image", attrs: { src: "images/note-1/photo.png" } },
          ],
        },
      ],
    });

    const rewritten = rewriteTiptapImageSources(content, (src) =>
      src === "images/note-1/photo.png" ? "./Trip Notes.assets/photo.png" : src,
    );

    expect(JSON.parse(rewritten)).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "image",
              attrs: { src: "./Trip Notes.assets/photo.png" },
            },
          ],
        },
      ],
    });
  });

  it("Should preserve non-managed image sources when mapper leaves them unchanged", async () => {
    const { rewriteTiptapImageSources } = await loadMarkdownModule();
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: { src: "https://example.com/image.png" },
        },
        {
          type: "image",
          attrs: { src: "data:image/png;base64,abc123" },
        },
      ],
    });

    const rewritten = rewriteTiptapImageSources(content, (src) => src);

    expect(JSON.parse(rewritten)).toEqual(JSON.parse(content));
  });
});

describe("markdownToTiptapJson - math markdown parsing", () => {
  it("Should not fetch remote assets when initializing markdown conversion", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { markdownToTiptapJson } = await loadMarkdownModule();

    markdownToTiptapJson("# First");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Should keep repeated conversions isolated when reusing the headless editor", async () => {
    const { markdownToTiptapJson } = await loadMarkdownModule();
    const firstParsed = JSON.parse(markdownToTiptapJson("# First"));
    const secondParsed = JSON.parse(markdownToTiptapJson("Plain second note"));

    expect(firstParsed).toMatchObject({ type: "doc" });
    expect(firstParsed.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          attrs: expect.objectContaining({ level: 1 }),
        }),
      ]),
    );
    expect(secondParsed).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            expect.objectContaining({
              type: "text",
              text: "Plain second note",
            }),
          ],
        },
      ],
    });
    expect(secondParsed.content).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "heading" })]),
    );
  });

  it("Should parse inline math markdown into an inline math node", async () => {
    const { markdownToTiptapJson } = await loadMarkdownModule();
    const parsed = JSON.parse(markdownToTiptapJson("$E=mc^2$"));

    expect(parsed).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "inlineMath",
              attrs: { latex: "E=mc^2" },
            },
          ],
        },
      ],
    });
  });

  it("Should parse block math markdown into a block math node", async () => {
    const { markdownToTiptapJson } = await loadMarkdownModule();
    const parsed = JSON.parse(markdownToTiptapJson("$$\\int_0^1 x^2 dx$$"));

    expect(parsed).toMatchObject({
      type: "doc",
    });
    expect(parsed.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "blockMath",
          attrs: { latex: "\\int_0^1 x^2 dx" },
        }),
      ]),
    );
  });

  it("Should parse mixed prose and inline math in one document", async () => {
    const { markdownToTiptapJson } = await loadMarkdownModule();
    const parsed = JSON.parse(
      markdownToTiptapJson(
        "Inline math inside prose: $a+b$ and **bold** text.",
      ),
    );

    expect(parsed).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: "Inline math inside prose: ",
            }),
            expect.objectContaining({
              type: "inlineMath",
              attrs: { latex: "a+b" },
            }),
            expect.objectContaining({
              type: "text",
              marks: expect.arrayContaining([
                expect.objectContaining({ type: "bold" }),
              ]),
            }),
          ]),
        },
      ],
    });
  });
});

describe("Tiptap markdown conversion - wiki links", () => {
  it("Should export wikiLink nodes as wiki-style markdown links", async () => {
    const { tiptapJsonToMarkdown } = await loadMarkdownModule();
    const markdown = tiptapJsonToMarkdown(
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "See " },
              {
                type: "wikiLink",
                attrs: {
                  noteTitle: "Project Plan",
                  displayText: "the plan",
                  isBroken: false,
                },
              },
              { type: "text", text: " next." },
            ],
          },
        ],
      }),
    );

    expect(markdown).toBe("See [[Project Plan|the plan]] next.");
  });

  it("Should import wiki-style markdown links as wikiLink nodes", async () => {
    const { markdownToTiptapJson } = await loadMarkdownModule();
    const parsed = JSON.parse(markdownToTiptapJson("See [[Project Plan]]."));

    expect(parsed).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "wikiLink",
              attrs: {
                noteTitle: "Project Plan",
                displayText: null,
                isBroken: false,
              },
            },
            { type: "text", text: "." },
          ],
        },
      ],
    });
  });
});
