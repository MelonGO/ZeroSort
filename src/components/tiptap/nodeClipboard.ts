/** Data needed to serialize a Tiptap atom node into fenced markdown. */
export interface AtomNodeClipboardPayload {
  nodeName: string;
  attrs: Record<string, unknown>;
}

/** Build fenced markdown for a Tiptap atom node. */
export function serializeAtomNodeToMarkdown({
  nodeName,
  attrs,
}: AtomNodeClipboardPayload): string {
  const sanitizedAttrs = Object.fromEntries(
    Object.entries(attrs).filter(([, value]) => value !== undefined),
  );

  return `:::${nodeName}\n${JSON.stringify(sanitizedAttrs)}\n:::`;
}

/** Copy serialized atom-node markdown to clipboard. */
export async function copyAtomNodeMarkdownToClipboard(
  payload: AtomNodeClipboardPayload,
): Promise<boolean> {
  if (!navigator?.clipboard) return false;

  try {
    const markdown = serializeAtomNodeToMarkdown(payload);
    await navigator.clipboard.writeText(markdown);
    return true;
  } catch {
    return false;
  }
}
