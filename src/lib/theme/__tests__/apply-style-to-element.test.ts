// @vitest-environment jsdom

/**
 * Tests for CSS custom property updates applied to DOM elements.
 */
import { applyStyleToElement } from "@/lib/theme/apply-style-to-element";
import { describe, expect, it } from "vitest";

describe("applyStyleToElement", () => {
  it("Should append a CSS custom property when no style exists", () => {
    const element = document.createElement("div");

    applyStyleToElement(element, "accent", "#fff");

    expect(element.getAttribute("style")).toBe("--accent: #fff;");
  });

  it("Should replace an existing custom property without removing others", () => {
    const element = document.createElement("div");
    element.setAttribute(
      "style",
      "color: red; --accent: #000; display: block;",
    );

    applyStyleToElement(element, "accent", "#fff");

    expect(element.getAttribute("style")).toBe(
      "color: red;  display: block;--accent: #fff;",
    );
  });

  it("Should remove duplicate definitions before appending the new value", () => {
    const element = document.createElement("div");
    element.setAttribute("style", "--accent: #000; --accent: #111;");

    applyStyleToElement(element, "accent", "#fff");

    expect(element.getAttribute("style")).toBe("--accent: #fff;");
  });
});
