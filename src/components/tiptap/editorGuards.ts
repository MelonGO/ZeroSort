import type { Editor } from "@tiptap/react";

/**
 * Returns true when the editor reference is still usable for command checks.
 * During note open/switch, React can retain a non-null editor while Tiptap has
 * already nulled `commandManager` during destruction.
 */
export function isEditorAvailable(
  editor: Editor | null | undefined,
): editor is Editor {
  return Boolean(editor) && !editor!.isDestroyed;
}

/**
 * Runs a toolbar selector against a live editor, returning `fallback` when the
 * editor is destroyed or Tiptap internals throw (e.g. `commandManager` is null).
 */
export function withEditorCommandState<T>(
  editor: Editor | null | undefined,
  select: (editor: Editor) => T,
  fallback: T,
): T {
  if (!isEditorAvailable(editor)) {
    return fallback;
  }

  try {
    return select(editor);
  } catch {
    return fallback;
  }
}
