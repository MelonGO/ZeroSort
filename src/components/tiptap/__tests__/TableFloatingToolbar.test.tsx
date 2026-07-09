// @vitest-environment jsdom

/**
 * Tests for table floating toolbar selector lifecycle safety.
 */

import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { selectTableFloatingToolbarState } from "../TableFloatingToolbar";

function createTableEditorMock(options?: {
  can?: () => unknown;
  isActive?: (name: string) => boolean;
  isDestroyed?: boolean;
}) {
  return {
    can:
      options?.can ??
      vi.fn(() => ({
        addRowBefore: vi.fn(() => true),
        addRowAfter: vi.fn(() => true),
        addColumnBefore: vi.fn(() => true),
        addColumnAfter: vi.fn(() => true),
        deleteRow: vi.fn(() => true),
        deleteColumn: vi.fn(() => true),
        mergeOrSplit: vi.fn(() => true),
        deleteTable: vi.fn(() => true),
      })),
    isActive: options?.isActive ?? vi.fn((name: string) => name === "table"),
    isDestroyed: options?.isDestroyed ?? false,
  };
}

describe("selectTableFloatingToolbarState", () => {
  it("Should return safe defaults when the editor is destroyed", () => {
    const editor = createTableEditorMock({ isDestroyed: true });

    expect(
      selectTableFloatingToolbarState(editor as unknown as Editor),
    ).toEqual({
      isInTable: false,
      canAddRowBefore: false,
      canAddRowAfter: false,
      canAddColumnBefore: false,
      canAddColumnAfter: false,
      canDeleteRow: false,
      canDeleteColumn: false,
      canMergeOrSplit: false,
      canDeleteTable: false,
    });
    expect(editor.can).not.toHaveBeenCalled();
  });

  it("Should return safe defaults when editor.can throws", () => {
    const editor = createTableEditorMock({
      can: vi.fn(() => {
        throw new TypeError("Cannot read properties of null (reading 'can')");
      }),
    });

    expect(
      selectTableFloatingToolbarState(editor as unknown as Editor),
    ).toEqual({
      isInTable: false,
      canAddRowBefore: false,
      canAddRowAfter: false,
      canAddColumnBefore: false,
      canAddColumnAfter: false,
      canDeleteRow: false,
      canDeleteColumn: false,
      canMergeOrSplit: false,
      canDeleteTable: false,
    });
  });

  it("Should return safe defaults when the editor is null", () => {
    expect(selectTableFloatingToolbarState(null)).toEqual({
      isInTable: false,
      canAddRowBefore: false,
      canAddRowAfter: false,
      canAddColumnBefore: false,
      canAddColumnAfter: false,
      canDeleteRow: false,
      canDeleteColumn: false,
      canMergeOrSplit: false,
      canDeleteTable: false,
    });
  });
});
