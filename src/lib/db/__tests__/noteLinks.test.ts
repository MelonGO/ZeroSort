/**
 * Tests for note links database operations and wiki link parsing.
 */

import { describe, expect, it } from "vitest";
import { extractWikiLinks } from "../noteLinks";

describe("extractWikiLinks", () => {
  it("Should extract simple wiki links", () => {
    const content = "This is a [[Note Title]] in the text.";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].linkText).toBe("Note Title");
    expect(links[0].displayText).toBeUndefined();
    expect(links[0].position).toBe(10);
  });

  it("Should extract wiki links with display text", () => {
    const content = "Check out [[Note Title|this link]] for more info.";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].linkText).toBe("Note Title");
    expect(links[0].displayText).toBe("this link");
    expect(links[0].position).toBe(10);
  });

  it("Should extract multiple wiki links", () => {
    const content =
      "Here is [[First Note]] and [[Second Note|another one]] and [[Third Note]].";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(3);
    expect(links[0].linkText).toBe("First Note");
    expect(links[1].linkText).toBe("Second Note");
    expect(links[1].displayText).toBe("another one");
    expect(links[2].linkText).toBe("Third Note");
  });

  it("Should handle wiki links at the start and end of content", () => {
    const content = "[[Start Note]] some text [[End Note]]";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].linkText).toBe("Start Note");
    expect(links[0].position).toBe(0);
    expect(links[1].linkText).toBe("End Note");
  });

  it("Should handle empty content", () => {
    const links = extractWikiLinks("");
    expect(links).toHaveLength(0);
  });

  it("Should handle content with no wiki links", () => {
    const content = "This is regular text with no links.";
    const links = extractWikiLinks(content);
    expect(links).toHaveLength(0);
  });

  it("Should handle malformed wiki links", () => {
    const content = "This has [[incomplete link and [[valid link]] only.";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].linkText).toBe("valid link");
  });

  it("Should trim whitespace from link text", () => {
    const content = "[[ Note With Spaces ]] and [[Another|  Display  ]]";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].linkText).toBe("Note With Spaces");
    expect(links[1].linkText).toBe("Another");
    expect(links[1].displayText).toBe("Display");
  });

  it("Should handle nested brackets in content", () => {
    const content = "Some [text] with [[Real Link]] and more [brackets].";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(1);
    expect(links[0].linkText).toBe("Real Link");
  });

  it("Should handle wiki links in JSON content", () => {
    const jsonContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Link to [[My Note]] here." }],
        },
      ],
    });

    const links = extractWikiLinks(jsonContent);
    expect(links).toHaveLength(1);
    expect(links[0].linkText).toBe("My Note");
  });

  it("Should extract wikiLink nodes from Tiptap JSON content", () => {
    const jsonContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Link to " },
            {
              type: "wikiLink",
              attrs: { noteTitle: "Structured Note", displayText: "shown" },
            },
          ],
        },
      ],
    });

    const links = extractWikiLinks(jsonContent);
    expect(links).toHaveLength(1);
    expect(links[0].linkText).toBe("Structured Note");
    expect(links[0].displayText).toBe("shown");
    expect(links[0].position).toBe(8);
  });

  it("Should handle multiple links on same line", () => {
    const content = "[[First]] [[Second]] [[Third]]";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(3);
    expect(links[0].position).toBe(0);
    expect(links[1].position).toBe(10);
    expect(links[2].position).toBe(21);
  });

  it("Should preserve position information correctly", () => {
    const content = "Start [[Link One]] middle [[Link Two]] end";
    const links = extractWikiLinks(content);

    expect(links).toHaveLength(2);
    expect(links[0].position).toBe(6);
    expect(links[1].position).toBe(26);
    expect(content.substring(links[0].position, links[0].position + 12)).toBe(
      "[[Link One]]",
    );
    expect(content.substring(links[1].position, links[1].position + 12)).toBe(
      "[[Link Two]]",
    );
  });
});
