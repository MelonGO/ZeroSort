const markdownPatterns = [
  /^#{1,6}\s/m,
  /\*\*[^*]+\*\*/,
  /__[^_]+__/,
  /\[[^\]]+\]\([^)]+\)/,
  /^[-*+]\s/m,
  /^\d+\.\s/m,
  /^>\s/m,
  /^```/m,
  /^---$/m,
  /^\*\*\*$/m,
  /^\|.+\|$/m,
  /^- \[[ xX]\]\s/m,
  /!\[[^\]]*\]\([^)]+\)/,
  /\[\[[^\[\]|]+(?:\|[^\]]+)?\]\]/,
  /^:::\w/m,
  /(^|\n)\$\$[\s\S]+?\$\$(?=\n|$)/m,
  /(^|[^\\$])\$(?!\$)(?=[^$\n]*[A-Za-z\\=^_+\-*/(){}\[\]])[^$\n]+\$(?!\$)/,
];

/** Heuristic check for common Markdown syntax in pasted text. */
export function looksLikeMarkdown(text: string): boolean {
  return markdownPatterns.some((pattern) => pattern.test(text));
}
